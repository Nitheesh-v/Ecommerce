# Phase 11 — Payment Management (Razorpay)

> **Status: complete and verified.** Gateway transactions, signature-verified
> checkout, idempotent webhooks, admin refunds, the `/admin/payments` console and a
> customer checkout page are implemented. 36 payment e2e tests and 13 unit tests
> pass; the whole backend suite (168 unit / 215 e2e) and the frontend build are green.
> Running it against **real** money needs Razorpay test (or live) credentials — §10.

Single-vendor store: no vendor splits, payouts or commissions. One order, one
collectable amount, one gateway.

---

## 1. Inspection findings (before any code)

| Question | Answer found in the repo | Consequence |
| --- | --- | --- |
| Is there a payments module? | No. `src/modules/*` has auth, users, products, categories, inventory, orders, customers, admin, uploads, health. | Greenfield module. |
| Is there a gateway SDK? | No `razorpay` dependency; nothing payment-related in `package.json`. | Either add the SDK or call the REST API. Chosen: REST + `node:crypto` (§3.1). |
| Payment env vars? | None in `env.validation.ts` (only commented placeholders in `.env.example`). | Add `RAZORPAY_*` to the validated schema, all-or-nothing. |
| Where does payment state live? | Inside the order: `payment.method`, `transactionId`, `paidAmount`, `paidAt`, `refunds[]`, plus denormalised `paymentMethod` / `paymentStatus`. | One attempt per order, no gateway ids, no event log, no retry model. |
| Can an admin mark an order paid? | Yes — `PATCH /api/admin/orders/:id/payment`. | Contradicts the brief. Restricted to offline methods with a mandatory reference (§5). |
| Are refunds modelled? | Yes, on the order: `payment.refunds[]` with `{refundId, amount, status, reason, reference, requestedAt/By, processedAt/By}`; capped at `paidAmount`, processed once. | Keep the order as the money owner; attach the gateway refund id instead of inventing a second refund table. |
| Raw body available? | `NestFactory.create(AppModule)` with the default JSON parser, no `verify` hook. | Webhook HMAC needs `{ rawBody: true }` — added in `main.ts` **and** `test/support/create-test-app.ts`. |
| Any checkout UI? | No cart, checkout or account pages; Payments was `Soon` in the sidebar. | Admin console built here; a minimal `/pay/[orderId]` page added so the integration is usable end to end. |

---

## 2. Data model

Two new collections, no duplicated schemas.

### `payments` — one record per gateway **attempt**

| Field | Meaning |
| --- | --- |
| `orderId`, `orderNumber` | The order being paid (indexed) |
| `userId`, `customerName`, `customerEmail` | Copied for readable lists without a join |
| `amount`, `currency` | Minor units. Always re-read from the order, never accepted from a client |
| `provider`, `method` | `razorpay` + `card` / `upi` / `netbanking` / `wallet` / `cod` / `manual` |
| `status` | `pending` · `authorized` · `captured` · `failed` · `cancelled` · `partially_refunded` · `refunded` |
| `gatewayStatus` | Raw status the gateway reported (`created`, `authorized`, `captured`…) |
| `gatewayOrderId`, `gatewayPaymentId` | `order_…` / `pay_…` — **unique** (partial indexes) so an id can never belong to two attempts |
| `signatureVerified`, `verifiedWithGateway` | How the outcome was established (browser signature vs gateway fetch/webhook) |
| `failureReason` | Safe, customer-facing text — never a raw payload |
| `capturedAt`, `failedAt`, `cancelledAt` | Timestamps for the console and the timeline |
| `refundedAmount`, `pendingRefundAmount` | Mirror of the order's refund ledger (see below) |

### `payment_events` — append-only audit + webhook idempotency

`eventId` is **unique**. A repeated delivery loses the insert and is answered
`{ duplicate: true }` without touching anything. `payloadHash` stores the SHA-256 of
the exact bytes received. `source` is `webhook` · `verify` · `admin` · `system`.

### Order changes (additive only)

* `payment.refunds[].gatewayRefundId` — the gateway refund (`rfnd_…`).
* `payment.refunds[].source` — `gateway` | `manual`.
* `CreateRefundDto` gained an optional internal `note`.
* `OrdersRepository.apply()` gained a `paymentStatus` guard, so two concurrent
  captures cannot both land.

**Who owns what.** The order owns money (`paidAmount`, `refunds[]`). The payment
record owns the *attempt* (gateway ids, gateway status, events). The payment's
refund totals are a **mirror**, written by a one-way listener: `OrdersService`
publishes refund changes on `OrderEvents`, `PaymentsService` subscribes on boot.
No module cycle, and a failing mirror can never fail a refund.

---

## 3. Backend

### 3.1 Gateway adapter

`RazorpayGateway` (`razorpay.gateway.ts`) implements `PaymentGateway` with plain
`fetch` + `node:crypto` — no SDK, no CJS/ESM friction, four endpoints:

* `POST /orders` — gateway order for the stored total;
* `GET /payments/:id` — the source of truth after checkout;
* `POST /payments/:id/refund` — refunds;
* HMAC verification for both the checkout signature (`order_id|payment_id`, key
  secret) and webhooks (raw body, webhook secret), compared with `timingSafeEqual`.

`DisabledPaymentGateway` is used when the three env vars are absent: the store boots,
admin views work, checkout answers **503** with an actionable message.

### 3.2 End-to-end flow

```
Browser (checkout page)
   │  POST /api/payments/create-order { orderId }
   ▼
PaymentsService ── order total read from Mongo (never from the request)
   │  reuses an open attempt, else inserts `payments{status:pending}`
   │  POST https://api.razorpay.com/v1/orders          → order_…
   ▼
Razorpay Checkout (hosted) — browser receives only the publishable `key_id`
   │  success → { razorpay_order_id, razorpay_payment_id, razorpay_signature }
   ▼
POST /api/payments/verify
   │  1. HMAC-SHA256("order_id|payment_id", key_secret) == signature
   │  2. GET /payments/:id  → status, amount, method   (never trust the browser)
   │  3. amount must equal the stored order total
   ▼
payments.update(status: captured)  [+ unique gatewayPaymentId]
OrdersService.confirmGatewayPayment()   (guarded, idempotent)
   └─ order.payment.paidAmount/paidAt/transactionId, paymentStatus = paid, history entry
```

The same capture can arrive twice — callback and webhook racing is normal:

* the payment write is guarded on `status ∈ {pending, authorized}`;
* the order write is guarded on `paymentStatus ∈ {pending, failed}` and returns
  `applied: false` when the same gateway payment id is already recorded;
* the webhook is de-duplicated on `eventId`.

### 3.3 Webhooks

`POST /api/payments/webhook` is public (the gateway cannot log in), `@SkipThrottle()`
because retries must never be rate-limited, and authenticated by
`HMAC-SHA256(rawBody, webhook_secret)`.

Order of operations: **signature → claim `eventId` → apply → (on error) release the
claim**. A duplicate is 200 `{ duplicate: true }` with no side effects; a failed
application releases the claim so the gateway's retry can finish the work.

| Event | Effect |
| --- | --- |
| `payment.authorized` | `pending → authorized`, order untouched |
| `payment.captured` | capture path above (payment + order) |
| `payment.failed` | `→ failed`, `failureReason` from the gateway, order stays payable |
| `refund.processed` / `refund.failed` | finalises the matching pending refund (by `gatewayRefundId`) |
| `order.paid` | recorded only — the following `payment.captured` does the work |
| anything else | recorded as `webhook.unhandled`, no change |

### 3.4 Refunds

1. Admin posts an amount + **mandatory reason** to `POST /api/admin/payments/:id/refund`.
2. The obligation is recorded on the order first (`pending`, audited, `source: manual`)
   — a crash mid-flight leaves a visible pending refund, never an invisible one.
3. Razorpay is called with our `refundId` as the receipt.
4. `processed` → the refund is finalised with the gateway refund id; `pending` → the id
   is attached and the `refund.processed` webhook completes it; `failed` → the refund is
   marked failed and the money stays put.

Guards against duplicate money:

* the sum of non-failed refunds can never exceed `paidAmount`;
* **one pending refund per order** — a second request is a 409;
* processing an already-finalised refund is a 409 (order service);
* a cancellation only ever *queues* an obligation — it never reports a refund.

### 3.5 API

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/payments/config` | public | provider, test-mode flag, **publishable** key id, currency |
| `POST` | `/api/payments/create-order` | customer (own order), `ActiveAccountGuard` | 201; server-priced |
| `POST` | `/api/payments/verify` | customer (own attempt) | 200; signature + gateway fetch |
| `POST` | `/api/payments/webhook` | HMAC signature | 200 `{received, duplicate, handled, eventId}` |
| `GET` | `/api/admin/payments` | admin | search, status, method, date range, sort, pagination |
| `GET` | `/api/admin/payments/summary` | admin | totals for the five cards |
| `GET` | `/api/admin/payments/:id` | admin | payment + order + customer + refunds + events + timeline |
| `GET` | `/api/admin/payments/:id/history` | admin | events + timeline |
| `POST` | `/api/admin/payments/:id/refund` | admin | 201; gateway-refunded |

There is **no endpoint that changes a payment status**. Validation uses DTOs with
`forbidNonWhitelisted` (a client-sent `amount` is a 400), authorization is
`@Roles(Role.Admin)` / ownership checks, and errors use the standard envelope
(`{ success:false, message, details? }` with the request id).

---

## 4. Status model

```
pending ──► authorized ──► captured ──► partially_refunded ──► refunded
   │            │             ▲
   └────────────┴──► failed   │
   └────────────────► cancelled
```

* `captured` / `partially_refunded` / `refunded` are the only money-holding states.
* `failed`, `cancelled`, `refunded` are terminal — nothing can move *back* into a
  paid state, and refunds are only reachable from a capture.
* The order's own `paymentStatus` remains a separate axis (`pending`, `paid`,
  `refund_pending`, `partially_refunded`, `refunded`), and fulfilment status is a
  third. They are never derived from one another; the mapping only flows
  payment-event → order.

---

## 5. The manual-payment rule

`PATCH /api/admin/orders/:id/payment` now refuses online methods outright
(“card payments are confirmed by the payment gateway and cannot be recorded
manually”), requires a reference for offline collections, and never touches a
refunded payment. Cash-on-delivery and bank transfers stay workable; card, UPI,
netbanking and wallet orders can only be paid through the gateway.

---

## 6. Frontend

### `/admin/payments`

Five summary cards (total, successful, pending, failed, total refunded amount),
server-paginated table with the requested columns (transaction id, order id,
customer, method, amount, status, payment date, actions), search by transaction /
order / customer, status and method filters, date range, sortable amount and date
columns, loading skeletons, error and empty states, and per-row “view”/“refund”
actions. A “Test mode” marker appears while test keys are configured.

### `/admin/payments/[id]`

Amount and refund totals, status + trust badge (gateway verified / signature only),
method, dates, failure reason, the order (fulfilment status and payment status shown
separately), customer, gateway references (`order_…`, `pay_…`, `rfnd_…`), timestamps,
refund history with gateway refund ids and an append-only event timeline. **No card
number, CVV or bank credential exists anywhere in the payloads** — the gateway only
ever returns ids and labels.

The refund dialog takes an amount (full or partial), a mandatory reason and an
optional note; it disables submission while a refund is pending and reports the
gateway's answer.

### `/pay/[orderId]` (storefront)

Minimal, authenticated “pay for this order” page: it reads the customer's own order,
explains that card details are entered on Razorpay's hosted checkout, opens the
widget with the publishable key and the server-created gateway order, and shows the
verified result. No amount is ever sent from the browser.

---

## 7. Verification

| Check | Command | Result |
| --- | --- | --- |
| Backend typecheck | `npm run typecheck` | ✓ |
| Backend lint | `npm run lint` | ✓ |
| Backend unit tests | `npx vitest run` | **168 passed / 16 files** (payments: 13 / 2 files) |
| Backend e2e tests | `npm run test:e2e` | **215 passed / 12 files** (payments: 36) |
| Backend build | `npm run build` | ✓ |
| Frontend typecheck / lint | `npm run typecheck`, `npm run lint` | ✓ |
| Frontend build | `npm run build` | ✓ — **27 routes**, incl. `/admin/payments`, `/admin/payments/[id]`, `/pay/[orderId]` |
| Console smoke | `npm run start -- --port 3013` then curl | 200 on `/admin/payments`, `/admin/payments/<id>`, `/pay/<id>`, `/admin/customers`, `/admin/orders`, `/admin/dashboard` |

Covered scenarios (all in `backend/test/payments.e2e-spec.ts` unless noted):

successful capture · failed payment · pending (authorized) payment · invalid checkout
signature · invalid webhook signature · duplicate webhook by event id · amount
mismatch · replay of a successful verification · full refund · partial refund ·
duplicate-refund prevention (cap, pending refund, non-captured payment) · refund
failure · refund finalised by webhook · unauthorized (401/403) admin access ·
payment/order status consistency · list filters/search/pagination · summary maths ·
detail + history · manual-payment restrictions.

Unit tests: payment state machine (`payment-status.spec.ts`), signature maths and
gateway error hygiene (`razorpay.gateway.spec.ts` — including “no secret in any
message”).

---

## 8. Security checklist

| Rule | Where it is enforced |
| --- | --- |
| Key secret is server-only | only read by `PaymentsModule`'s factory; only used in the `Authorization` header; `.env` only |
| Never trust frontend “success” | `verify` re-reads the payment from the gateway before writing anything |
| Never store card/CVV | no such field exists; the widget is hosted by Razorpay |
| Never log secrets | no log statement includes headers, secrets or raw payloads; errors use fixed text + the gateway's `description` |
| Webhook authenticity | HMAC-SHA256 over the **raw** bytes (`rawBody: true`), `timingSafeEqual` |
| Webhook replay | unique `eventId` in `payment_events`, 200 with `duplicate: true` |
| No client amount | DTO rejects extra fields; the amount is read from the order |
| Admin cannot mark paid | the manual endpoint refuses online methods; there is no status endpoint |
| Cancellation ≠ refund | cancelling queues a `pending` obligation; status only moves on a verified refund |
| Suspended customers cannot pay | `ActiveAccountGuard` on checkout routes |
| Ids cannot be probed | someone else's order/payment answers 404 |

---

## 9. Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `RAZORPAY_KEY_ID` | for online payments | `rzp_test_…` (test mode) or `rzp_live_…`. **Public** — sent to the widget |
| `RAZORPAY_KEY_SECRET` | with the key id | server-only signing secret |
| `RAZORPAY_WEBHOOK_SECRET` | with the key id | server-only webhook secret |

All three together, or none. A partial set aborts boot with a readable message
(`env.validation.ts`).

---

## 10. What still needs real credentials / manual setup

Nothing in the code path is mocked in production — but these steps need a Razorpay
account and dashboard access, which this environment does not have:

1. **Create test-mode API keys** (Dashboard → Account & Settings → API Keys) and set
   `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`. Test keys start with `rzp_test_` and the
   console shows “Test mode”.
2. **Register the webhook**: Dashboard → Webhooks → `https://<api-host>/api/payments/webhook`,
   events `payment.authorized`, `payment.captured`, `payment.failed`, `refund.processed`,
   `refund.failed`. Copy the signing secret into `RAZORPAY_WEBHOOK_SECRET`.
   Locally, expose the API with a tunnel (e.g. `ngrok http 5000`) — Razorpay cannot
   reach `localhost`.
3. **Enable auto-capture** for the account (or capture manually) so `payment.captured`
   arrives; the flow accepts both `captured: true` and `status: captured`.
4. **Pay with a test instrument** (Razorpay test cards / UPI success-failure simulators)
   against `/pay/<orderId>` and confirm: order → paid, console → captured, webhook log
   → one event per delivery.
5. **Refund** from the console (or the dashboard) and confirm `refund.processed`
   finalises the same refund (no duplicate row).
6. **Live go-live**: switch to `rzp_live_…` keys in the production environment only,
   re-register the webhook for the production URL, and keep the secrets in the
   platform's secret store — never in the repository.

No background worker is required: webhooks are the retry mechanism, and every handler
is idempotent.

---

## 11. Known issues & deliberate decisions

* **Two collections, not one.** The order cannot model multiple attempts, gateway ids
  or an event log; the payment record cannot model line items or fulfilment. Splitting
  them at "attempt vs. sale" is what keeps both honest.
* **Refund ownership stays on the order.** Moving `refunds[]` into `payments` would
  duplicate a money ledger that cancellations and returns already rely on. The gateway
  refund id and `source` were added instead.
* **Payment status is not editable anywhere.** Requirement, and the reason the console
  has no status control at all.
* **`order.paid` is recorded but not acted on.** It carries no payment id; acting on it
  would double-apply alongside `payment.captured`.
* **Route-level rate limiting on checkout was removed** in favour of the global limiter:
  a shared-IP test suite (or a store behind one NAT) would otherwise see 429s on
  legitimate retries. The webhook is exempt entirely.
* `GET /api/payments/config` is public by design — it returns only the publishable key.
* The `/pay/[orderId]` page is intentionally minimal: the cart/checkout module is a
  separate phase, and this page exists so the payment integration is usable today.

---

## 12. Completion report

### Files created

**Backend**
```
src/modules/payments/payments.module.ts
src/modules/payments/payments.controller.ts
src/modules/payments/admin-payments.controller.ts
src/modules/payments/payments.service.ts
src/modules/payments/payment-status.ts
src/modules/payments/payment-gateway.ts
src/modules/payments/razorpay.gateway.ts
src/modules/payments/disabled.gateway.ts
src/modules/payments/schemas/payment.schema.ts
src/modules/payments/schemas/payment-event.schema.ts
src/modules/payments/repositories/payments.repository.ts
src/modules/payments/repositories/mongo-payments.repository.ts
src/modules/payments/repositories/payment-events.repository.ts
src/modules/payments/repositories/mongo-payment-events.repository.ts
src/modules/payments/dto/payment-actions.dto.ts
src/modules/payments/dto/payments-query.dto.ts
src/modules/payments/payment-status.spec.ts
src/modules/payments/razorpay.gateway.spec.ts
src/modules/orders/order-events.ts
test/payments.e2e-spec.ts
test/support/in-memory-payments.repository.ts
test/support/in-memory-payment-events.repository.ts
test/support/fake-payment-gateway.ts
```

**Frontend**
```
src/types/payment.ts
src/services/admin/payments.service.ts
src/services/store/payments.service.ts
src/hooks/use-payment-list.ts
src/components/admin/payments/payment-badges.tsx
src/components/admin/payments/payment-summary-cards.tsx
src/components/admin/payments/payments-filters.tsx
src/components/admin/payments/payments-table.tsx
src/components/admin/payments/payments-view.tsx
src/components/admin/payments/payment-detail-view.tsx
src/components/admin/payments/payment-refund-dialog.tsx
src/components/admin/payments/payment-timeline.tsx
src/components/store/pay-order-view.tsx
src/lib/payments/razorpay-checkout.ts
src/app/admin/(console)/payments/page.tsx
src/app/admin/(console)/payments/[id]/page.tsx
src/app/(store)/pay/[orderId]/page.tsx
```

### Files modified

```
backend/src/app.module.ts                       PaymentsModule registered
backend/src/main.ts                             NestFactory.create(..., { rawBody: true })
backend/src/config/env.validation.ts            RAZORPAY_KEY_ID / KEY_SECRET / WEBHOOK_SECRET (all-or-none)
backend/.env.example                            payments section + webhook instructions
backend/src/modules/orders/schemas/order.schema.ts      refund.gatewayRefundId, refund.source
backend/src/modules/orders/repositories/orders.repository.ts   guard.paymentStatus, RefundRecord fields
backend/src/modules/orders/repositories/mongoose-orders.repository.ts   paymentStatus guard + import
backend/src/modules/orders/orders.service.ts    confirmGatewayPayment, attachGatewayRefund,
                                                createRefundForGateway, offline-only manual payments,
                                                refund events, internal order getters
backend/src/modules/orders/orders.module.ts     provides/exports OrderEvents
backend/src/modules/orders/dto/order-actions.dto.ts      CreateRefundDto.note
backend/src/modules/orders/orders.service.spec.ts        reference required by offline payments
backend/test/orders.e2e-spec.ts                          same
backend/test/support/create-test-app.ts         payment tokens/providers + rawBody
frontend/src/components/admin/layout/nav-config.ts       Payments → available
docs/PHASE-11-PAYMENTS.md                       this report
README.md, docs/ARCHITECTURE.md                 status, phase table, data-model notes
```

### Commands

```bash
cd backend  && npm run verify        # typecheck, lint, unit, e2e, build
cd frontend && npm run typecheck && npm run lint && npm run build
```
