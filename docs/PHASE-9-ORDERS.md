# Phase 9 — Order Management

> Status: **implemented and verified.** Orders are the system of record for money and stock:
> totals are computed server-side, every status change goes through one state machine, stock is
> restored at most once, and refunds are obligations you have to settle — never assumptions.

---

## 1. Inspection findings

Read before writing code. The brief (user "PHASE 5") asks for orders *and* their side effects, so the
first question was what already existed and could be reused.

| Found | Where | Consequence for this phase |
| --- | --- | --- |
| No orders module, no order schema, no checkout route | `backend/src/modules` | This phase creates them; nothing is migrated or renamed. |
| Stock is owned by `InventoryService`, which already exposes `reserveForOrder` / `restockForOrder` with `(referenceId, type)` idempotency | `inventory/inventory.service.ts` | Orders **call** those hooks. No stock arithmetic is duplicated in the order module. |
| `products.stock` is the single quantity; `PATCH /products/:id` already refuses `stock` | Phase 8 | Order creation reserves atomically and gets `409` when the units are gone — overselling is impossible. |
| Products expose `price`, `salePrice` (`effectivePrice`), `sku`, `images[]`, `status`, `stock` in paise | `products.service.ts` (`AdminProductView`) | Lines snapshot `effectivePrice` as `unitPrice` and `price` as `listPrice`; the discount is derived, not stored on the product. |
| Auth already provides `@Roles(Role.Admin)`, a global `RolesGuard` and `@CurrentUser()` | `common/decorators/*` | Admin routes are `@Roles(Role.Admin)`; customer routes use the same token, so `userId` comes from the session — never from the body. |
| Admin dashboard already aggregates an `orders` collection (`orderNumber`, `customerName`, `customerEmail`, `items[]`, `total`, `status`, `paymentStatus`, `createdAt`) | `admin/repositories/mongo-dashboard.repository.ts` | The new schema satisfies those fields, so dashboard revenue/status widgets light up **without** touching the dashboard code. |
| Customers are `users` documents with `role: customer`; there is no separate customer profile | `users` module | Order keeps a denormalised `customerName` / `customerEmail` / `customerPhone` snapshot **and** an optional `userId`. |
| Money is integer paise everywhere; there is no payment gateway in the repo | `products`, `inventory` | Order pricing is integer paise. Payment is recorded as a **verified fact by an admin**, with an explicit seam for a future gateway webhook. |
| No shipping carrier integration exists (and inventing one was out of scope) | — | Shipping is stored data: provider name, tracking number, tracking URL, dates, notes. Nothing pretends to call a carrier. |
| Storefront has no cart/checkout pages | `frontend/src/app/(store)` | Customer-side order APIs are complete and tested; the storefront UI for them is a later slice (see §6). |

---

## 2. Backend

### 2.1 Files

```
backend/src/modules/orders/
├── orders.module.ts                  # wiring: Mongoose(Order) + Products + Inventory + repository token
├── orders.controller.ts              # /api/orders        (any signed-in customer, own orders only)
├── admin-orders.controller.ts        # /api/admin/orders  (@Roles(Role.Admin))
├── orders.service.ts                 # every rule in this document
├── orders.service.spec.ts            # 27 unit tests
├── order-status.ts                   # the state machine
├── pricing.ts                        # pricing config + money maths
├── invoice.ts                        # invoice builder + store profile
├── dto/
│   ├── create-order.dto.ts           # items, shippingAddress, shippingMethod, paymentMethod, idempotencyKey
│   ├── orders-query.dto.ts           # page, limit, search, status, paymentStatus, paymentMethod, from, to, sort
│   └── order-actions.dto.ts          # status, cancel, shipping, payment, refund, refund decision, return, return step
├── schemas/
│   └── order.schema.ts               # orders collection (snapshots, history, refunds, returns)
└── repositories/
    ├── orders.repository.ts          # abstract contract (DI token) + record/view types
    └── mongoose-orders.repository.ts # atomic create/find/apply
```

Supporting changes:

| File | Change |
| --- | --- |
| `app.module.ts` | registers `OrdersModule` |
| `test/support/in-memory-orders.repository.ts` | in-memory fake with the same contract (path-setter `apply`, history `$push` semantics) |
| `test/support/create-test-app.ts` | stubs the `Order` model token, adds an `orders?` repository override |
| `test/orders.e2e-spec.ts` | 26 end-to-end tests |

### 2.2 Endpoints

Admin — `/api/admin/orders`, `@Roles(Role.Admin)` (401 anonymous, 403 customer):

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Paginated list — `search` (order number, customer name, email), `status`, `paymentStatus`, `paymentMethod`, `from`/`to`, `sortBy=createdAt\|total`, `sortOrder` |
| `POST` | `/` | Manual order for a customer (phone/WhatsApp orders) |
| `GET` | `/:id` | Full order + derived flags (`allowedNextStatuses`, `canCancel`, `canRequestReturn`, `activeReturn`, `refundedAmount`, `pendingRefundAmount`, `balanceDue`, `itemCount`) |
| `PATCH` | `/:id/status` | Transition (`status`, optional `reason`, `note`) |
| `POST` | `/:id/cancel` | Cancellation (`reason`, optional `note`) + exactly-once restock + refund obligation |
| `PATCH` | `/:id/shipping` | Provider, tracking number/URL, shipped date, ETA, note |
| `PATCH` | `/:id/payment` | Record a verified payment (`paid` / `failed`) |
| `GET` | `/:id/history` | Append-only history |
| `GET` | `/:id/invoice` | Invoice document built from snapshots |
| `POST` | `/:id/refunds` | Queue a refund (`amount`, `reason`) |
| `PATCH` | `/:id/refunds/:refundId` | Settle a queued refund (`processed` / `failed`, `reference`) |
| `POST` | `/:id/returns` | Start a return (`reason`, `items[{ productId, quantity }]`) |
| `PATCH` | `/:id/returns/:returnId` | Return step (`approve`, `reject`, `receive`, `inspect`, `complete`) |

Customer — `/api/orders`, `userId` taken from the session:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | **Own** orders only |
| `POST` | `/` | Checkout (idempotent, reserves stock) |
| `GET` | `/:id` | Own order (anyone else's is a `404`, not a `403` — no existence leak) |
| `POST` | `/:id/cancel` | Cancel own order while still cancellable |
| `POST` | `/:id/returns` | Request a return on a delivered order |
| `GET` | `/:id/invoice` | Own invoice |

### 2.3 Schema — `orders`

Snapshots first: nothing on an order is re-read from the catalogue later.

| Group | Fields |
| --- | --- |
| Identity | `orderNumber` (`ORD-YYYYMMDD-NNNN`), `userId?`, `customerName`, `customerEmail`, `customerPhone?`, `idempotencyKey?` |
| Lines | `items[]`: `productId`, **`name`, `sku`, `imageUrl`, `unitPrice`, `listPrice`, `discount`, `quantity`, `lineTotal`** |
| Money | `subtotal`, `discountTotal`, `couponCode?`, `couponDiscount`, `shippingCharge`, `taxAmount`, `taxRatePercent`, `total`, `currency` |
| Delivery | `shippingAddress` (snapshot: recipient, phone, lines, city, state, postal code, country), `shippingMethod`, `shipping?` (`provider`, `trackingNumber`, `trackingUrl`, `shippedAt`, `estimatedDelivery`, `deliveredAt`, `notes[]`) |
| Payment | `payment.method`, `transactionId?`, `paidAmount`, `paidAt?`, `refunds[]` (`refundId`, `amount`, `status`, `reason`, `reference?`, who/when); denormalised `paymentMethod`, `paymentStatus` |
| Lifecycle | `status`, `cancellation?` (`reason`, `note`, `cancelledAt`, `cancelledBy`, `restocked`, `restockedAt`), `returns[]`, `closedAt`, timestamps |
| Audit | `history[]` — append-only `{ kind, from, to, reason, note, by{userId,email}, at }` |

Indexes: `{ createdAt: -1 }`, `{ userId, createdAt: -1 }`, `{ status, createdAt: -1 }`,
`{ paymentStatus, createdAt: -1 }`, unique `{ orderNumber }`, sparse unique `{ idempotencyKey }`,
text-ish search handled with an escaped regex over `orderNumber`, `customerName`, `customerEmail`.

Order numbers come from an atomic `counters` upsert per day (`ORD-20261104-0007`), so two concurrent
checkouts can never share a number.

### 2.4 Status machine

```
pending → confirmed → processing → shipped → out_for_delivery → delivered
   │           │            │
   └───────────┴────────────┴──→ cancelled            (only before shipment)
delivered → return_requested → returned
                    └────────→ delivered             (return rejected)
cancelled → ∅            returned → ∅
```

| Rule | Behaviour |
| --- | --- |
| Illegal jump (`pending → shipped`) | `409` with `Pending → Shipped` in the message; nothing is written |
| No-op (`shipped → shipped`) | `400` |
| Cancellation through the status endpoint | `400` — cancellation has its own rules and side effects |
| `return_requested` / `returned` through the status endpoint | `400` — returns are a workflow, not a status edit |
| Every change | One atomic `findOneAndUpdate` guarded on the previous status, plus the history entry — so a concurrent update cannot double-apply |

The client never chooses freely: `GET /:id` returns `allowedNextStatuses`, and the UI only offers
those. The server validates regardless.

### 2.5 Pricing

```
line.unitPrice = product.effectivePrice      (salePrice ?? price)
line.listPrice = product.price
line.discount  = (listPrice − unitPrice) × quantity
line.lineTotal = unitPrice × quantity

subtotal        = Σ lineTotal
discountTotal   = Σ line.discount
couponDiscount  = 0 today (coupons arrive with the coupon module)
shippingCharge  = subtotal ≥ threshold ? 0 : flat
taxAmount       = round((subtotal − discounts + shipping) × taxRate)
total           = subtotal − discountTotal − couponDiscount + shippingCharge + taxAmount
```

Configuration (env, optional): `ORDER_FREE_SHIPPING_THRESHOLD` (default `99900` = ₹999),
`ORDER_FLAT_SHIPPING_CHARGE` (default `4900` = ₹49), `ORDER_TAX_RATE_PERCENT` (default `0`, i.e.
prices are tax-inclusive as is normal in India). All arithmetic is integer paise.

Prices are **never** read from the request. `forbidNonWhitelisted` turns a client-sent `total` or
`unitPrice` into a `400`, which is asserted in the e2e suite.

### 2.6 Stock integration (exactly once)

| Trigger | Call | Reference key |
| --- | --- | --- |
| Checkout / manual order | `inventory.reserveForOrder` per line | `order:<orderNumber>:<productId>` |
| Failed checkout (later line unavailable) | `inventory.restockForOrder` (compensation) | `order:<orderNumber>:rollback:<productId>` |
| Cancellation | `inventory.restockForOrder` per line | `order:<orderNumber>:cancel:<productId>` |
| Return restock (after inspection) | `inventory.restockForOrder` per line | `order:<orderNumber>:return:<returnId>:<productId>` |

`inventory_movements` has a partial unique `{ referenceId, type }`, so a replay is a `duplicate`
rather than a second movement. The order additionally carries `cancellation.restocked` as a second
guard: a cancelled order delivered as three webhooks still restores stock once — unit- and e2e-tested
(the e2e test cancels twice and asserts both the `409` and the unchanged product quantity).

Insufficient stock is a `409` with the available quantity; an unpublished product is a `400`.

### 2.7 Payments & refunds (no assumptions)

- `PATCH /:id/payment { status: 'paid' }` is the **only** way an order becomes paid. The storefront
  cannot claim payment; there is no route that accepts a client "I paid" flag.
- Recording a payment twice is refused (`400`), and `paidAmount` is set to the order total by the
  server.
- Refunds are `payment.refunds[]` obligations: `POST /:id/refunds` creates a `pending` refund and
  moves `paymentStatus` to `refund_pending`; the money is only considered returned when an admin
  settles it with `PATCH /:id/refunds/:refundId { status: 'processed' }`.
- Sum of refunds is capped at `paidAmount`; `processed` and `pending` refunds are both counted
  against the cap, and a refund can be settled exactly once (`409` on replay).
- Cancelling a **paid** order queues a refund — it never sets `paymentStatus: 'refunded'`. A test
  asserts precisely that: status `refund_pending`, one pending refund, `paymentStatus !== 'refunded'`.
- Insurance against a future gateway: `PATCH /:id/payment` exists for a webhook handler to call with
  a **verified** transaction id. No gateway SDK, no invented integration.

### 2.8 Returns

```
requested ──approve──→ approved ──receive──→ received ──inspect──→ inspected ⇢ restocked
    │                      │                                              │
    └─────reject───────────┴──────────────→ rejected (order back to delivered)
                                                              inspected/restocked ──complete──→ returned
```

- A return can only be **requested** for a `delivered` order, for quantities that were actually
  purchased (`400` otherwise). The order becomes `return_requested` while it is in flight.
- `refundableAmount` = Σ returned unit price × quantity, stored on the return.
- Stock is restored **only** at `inspect` with `restockApproved: true`, via the idempotent inventory
  call; an inspection that fails the goods leaves stock untouched (tested).
- `complete` moves the order to `returned`, sets `closedAt`, and queues a refund for
  `min(remaining refundable, return.refundableAmount)` — still an obligation, not a payment.
- Rejecting a return restores the order status to `delivered`; nothing is restocked or refunded.

### 2.9 Invoices

`invoice.ts` builds the invoice **only** from the stored order: store profile (name, legal name,
email, phone, website, address lines, GSTIN), invoice number `INV-<orderNumber>`, issue date, customer
snapshot and billing address, lines (`name`, `sku`, `quantity`, `unitPrice`, `discount`, `lineTotal`),
totals (subtotal, discounts, coupon, shipping, tax, grand total, paid, refunded, balance) and payment
info. Store details are env-overridable (`STORE_NAME`, `STORE_LEGAL_NAME`, `STORE_EMAIL`,
`STORE_PHONE`, `STORE_WEBSITE`, `STORE_ADDRESS` (`|`-separated lines), `STORE_GSTIN`).

Because it reads snapshots, renaming a product or changing its price afterwards leaves an issued
invoice byte-for-byte the same — asserted in both the unit and e2e suites.

### 2.10 Data isolation & idempotency

- Customer reads/writes are scoped by `userId` **from the token**; an id belonging to someone else
  answers `404`. The e2e suite has two customers and checks that neither can list, read, cancel or
  invoice the other's order.
- `POST /api/orders` accepts an `idempotencyKey`; a second call returns the original order
  (`created: false`) instead of a duplicate. There is also a sparse unique index as a backstop.
- Every mutating endpoint is naturally idempotent-safe where it matters: a replay finds the order in
  a state where the transition is illegal and returns a conflict instead of applying twice.

---

## 3. Frontend — admin console

| File | Purpose |
| --- | --- |
| `src/types/order.ts` | Order, payment, refund, return, history and invoice types; label maps; fulfilment steps; cancellation reasons |
| `src/services/admin/orders.service.ts` | `list`, `get`, `history`, `invoice`, `updateStatus`, `cancel`, `updateShipping`, `updatePayment`, `createRefund`, `updateRefund`, `requestReturn`, `updateReturn` |
| `src/hooks/use-order-list.ts` | Server-paginated list (debounced search, abortable requests, `loading` derived from the query key) + `useOrderDetail` |
| `components/admin/orders/orders-view.tsx` | Page shell: header, CSV export (pages the API, not the table), filters, table, pagination, empty/error states |
| `…/orders-filters.tsx` | Search (number / name / email), status, payment status, payment method, date range, sort |
| `…/orders-table.tsx` | All brief-mandated columns + badges + row actions; sortable Date and Total |
| `…/order-detail-view.tsx` | Detail page: items, address, shipping & tracking, payment & refunds, pricing, timeline, side cards |
| `…/order-timeline.tsx` | Fulfilment stepper (with a terminal banner for cancelled/returned) + append-only history feed |
| `…/order-action-dialog.tsx` | One dialog for status, cancel, shipping, payment, refund and refund settlement — each explains its consequences |
| `…/return-panel.tsx` | Return workflow: approve → receive → inspect (restock choice) → complete |
| `…/order-invoice-view.tsx` | Printable invoice: store, bill-to, lines, totals, payment; `Print / Save as PDF` |
| `…/order-badges.tsx` | Re-exports the shared status badges (tones live in `ui/badge.tsx`) |
| `app/admin/(console)/orders/page.tsx` | `/admin/orders` |
| `app/admin/(console)/orders/[id]/page.tsx` | `/admin/orders/[id]` |
| `app/admin/(console)/orders/[id]/invoice/page.tsx` | `/admin/orders/[id]/invoice` |

Also touched: `components/admin/layout/nav-config.ts` (Orders is now an active nav item; record ids
render as "Details" in breadcrumbs), `components/admin/ui/badge.tsx` (tones for
`return_requested`, `refund_pending`, `partially_refunded`, returns), `globals.css` +
`admin-sidebar.tsx` / `admin-header.tsx` / `admin-shell.tsx` (`data-print-hidden` and console-padding
resets so the invoice prints on a clean sheet).

Behaviour worth calling out:

- **Nothing is optimistic.** Every mutation re-reads the order from the API, because the server
  decides whether a transition, restock or refund is allowed.
- **Actions are gated by the API's flags** (`allowedNextStatuses`, `canCancel`, refundable balance),
  so the console cannot even offer an illegal action.
- **Destructive actions explain themselves** before submitting: cancelling says stock is restored
  once and a refund is merely *queued*; refunds say they are queued until settled.
- Disabled/absent states are explicit: no transitions → no "Update status" button; refundable zero →
  no refund button; cancelled → no shipping edit.

---

## 4. Verification

Backend (`cd backend`):

```
npm run verify
```

```
✓ Type check........ 7.7s
✓ Lint.............. 0.2s
✓ Unit tests........ 4.0s
✓ E2E tests......... 14.0s
✓ Production build.. 7.9s
All checks passed.
```

| Suite | Result |
| --- | --- |
| Unit | **132 passed** / 12 files (105 before + 27 in `orders.service.spec.ts`) |
| E2E | **157 passed** / 10 files, including `orders.e2e-spec.ts` **26 passed** |

Coverage against the brief:

| Requirement | Test |
| --- | --- |
| Listing + pagination | e2e `paginates, searches and filters`; unit repository/list mapping |
| Search by number and by customer name/email | same test (three searches) |
| Filters (status, payment status, method, date range) | e2e `paginates…`, `filters by order date`, `sorts by total and rejects invalid filters` |
| Sorting by date and total | e2e sort test + 400 on an unknown `sortBy` |
| Details | e2e `returns the full order and its timeline`; `404` for unknown id |
| Valid / invalid transitions | unit (4 tests) + e2e `accepts a legal transition and rejects an illegal one` |
| Cancellation + duplicate cancellation | unit + e2e `restores stock once and refuses a duplicate cancellation` |
| Inventory restoration (exactly once) | asserted twice: `cancellation.restocked` and unchanged product quantity |
| Cancel after shipment refused | unit + e2e `refuses to cancel a shipped order` |
| Paid cancellation → refund obligation, not a refund | unit + e2e `queues a refund obligation for a paid order` |
| Shipping + tracking (URL validation) | e2e `records tracking details and validates the URL` |
| Payment recording (once) | unit + e2e `records a manual payment once` |
| Returns: full workflow, restock only after inspection | unit (4) + e2e `runs the full return workflow and restocks only after inspection` |
| Returns: not deliverable before delivery / over-quantity | unit + e2e `rejects a return for an order that has not been delivered` |
| Refunds: capped, single processing | unit + e2e `caps refunds and refuses to process the same refund twice` |
| Invoice snapshot immunity | unit + e2e `is derived from the stored snapshot` |
| Unauthorized access | e2e `blocks anonymous access` (401) + `refuses customers on the admin order routes` (403) |
| Customer isolation | e2e list/read/cancel/invoice across two customers |
| Duplicate order creation | e2e idempotent replay + `forbidNonWhitelisted` injection test |
| Oversell / unpublished | e2e `rejects unpublished products and overselling`; unit compensation test |
| Admin manual order | e2e `creates a manual order for a customer` |

Frontend (`cd frontend`):

```
npm run typecheck   → clean
npm run lint        → clean
npm run build       → 23 routes
/admin/orders                ○
/admin/orders/[id]           ◐
/admin/orders/[id]/invoice   ◐
```

The production build was served on port 3013 and smoke-tested: `/admin/orders`,
`/admin/orders/<id>`, `/admin/orders/<id>/invoice` and `/admin/dashboard` all returned `200`. The
console is behind a client-side auth gate that renders a skeleton on the server, so an HTTP smoke
test cannot exercise populated tables; the data contract is covered by the backend e2e suite (no
browser is available in this environment).

---

## 5. Run it locally

```
cd backend && npm run start:dev      # http://localhost:5000/api
cd frontend && npm run dev           # http://localhost:3000
```

Then open `http://localhost:3000/admin/orders`:

1. the table loads from `/api/admin/orders` with paging, search and filters;
2. open an order → **Update status** walks the allowed transitions, **Shipping** stores tracking,
   **Record payment** settles a pending order, **Cancel order** restores stock and queues a refund;
3. **Invoice** opens the printable invoice (`Print / Save as PDF` → browser PDF);
4. for a delivered order, the return panel walks approve → receive → inspect → complete.

To create an order without a storefront checkout, `POST /api/admin/orders` (admin token) or
`POST /api/orders` (customer token) with `{ items, shippingAddress, paymentMethod }`.

---

## 6. Known issues & decisions

1. **No storefront checkout UI.** The customer API (`POST /api/orders`, cancel, returns, invoice) is
   implemented and tested, but the storefront still has no cart/checkout pages; that belongs to the
   cart/checkout slice. Admin-created and API-created orders are fully usable today.
2. **Payments are recorded, not processed.** There is no gateway integration, by instruction. An
   admin records a verified payment; a future webhook calls the same service method with a verified
   transaction id. Nothing in the UI can mark an order paid.
3. **Shipping is data, not an integration.** Provider is a free-text name plus tracking number/URL.
   Carrier APIs, label printing and status webhooks would plug in behind the existing
   `PATCH /:id/shipping` contract; no provider is claimed to be supported.
4. **Invoice is HTML + browser print, not server-side PDF.** This gives identical numbers and a clean
   print sheet without adding a PDF renderer; a server PDF endpoint can reuse `buildInvoice()`.
5. **Coupons are not applied yet.** `couponCode`/`couponDiscount` exist in the schema and invoice so
   the coupon module can fill them without a migration; today the value is always `0`.
6. **Tax defaults to 0 % (inclusive pricing).** Set `ORDER_TAX_RATE_PERCENT` to add tax on top;
   per-line tax breakdowns (CGST/SGST) are not modelled.
7. **No transactions.** MongoDB standalone has no multi-document transactions. The design relies on
   guarded single-document updates, idempotent inventory references, and a compensation path when a
   later checkout line fails. A replica set could wrap checkout in a session.
8. **Refunds are manual by design.** A queued refund must be settled with a gateway reference; there
   is no attempt to move money.
9. **CSV export is client-driven** (pages `limit=100`), so a very large order history makes several
   requests; a server-side export belongs with reporting.
10. **No email/notification on status change.** The order history records everything; sending mail
    is a notifications-module concern.
11. **No frontend test runner**, so the console is verified by typecheck/lint/build/smoke plus the
    backend contract suite.

---

## 7. Completion report

**Files created** — backend: 10 module files (incl. `order-status.ts`, `pricing.ts`, `invoice.ts`,
repository contract + Mongoose implementation), 3 DTO files, 1 schema, 1 unit spec, 1 e2e spec,
1 in-memory repository. Frontend: `types/order.ts`, `services/admin/orders.service.ts`,
`hooks/use-order-list.ts`, 8 components under `components/admin/orders/`, 3 route files.

**Files modified** — `backend/src/app.module.ts`, `backend/test/support/create-test-app.ts`;
`frontend` `nav-config.ts`, `ui/badge.tsx`, `globals.css`, `admin-shell.tsx`, `admin-sidebar.tsx`,
`admin-header.tsx`; `README.md`, `docs/ARCHITECTURE.md`.

**Endpoints** — 13 admin + 6 customer (§2.2), all admin routes `@Roles(Role.Admin)`.

**Schema** — `orders` with immutable line/address snapshots, denormalised statuses, `payment.refunds[]`,
`returns[]`, `cancellation`, and append-only `history[]`; unique order number and sparse-unique
idempotency key.

**Transition rules** — linear fulfilment (`pending → confirmed → processing → shipped →
out_for_delivery → delivered`), cancellation only before shipment, returns only after delivery
(`return_requested → returned`, or back to `delivered` when rejected), illegal jumps `409`, no-ops
`400`, return states unreachable through the status endpoint.

**Inventory integration** — `reserveForOrder` at checkout (with compensation on partial failure),
`restockForOrder` on cancellation and after an approved return inspection; every call carries a
stable `referenceId` and the inventory unique index plus `cancellation.restocked` make restoration
exactly-once.

**Payment integration** — admin-recorded verified payments, no client-trust path, no gateway
assumption; refunds are capped, queued and settled exactly once, and a paid cancellation leaves
`paymentStatus: refund_pending` rather than pretending money moved.

**Invoice functionality** — `GET /:id/invoice` (admin + owner) built purely from snapshots, with
env-configurable store profile; printable page with `Print / Save as PDF`.

**Tests** — backend 132 unit + 157 e2e green, `orders` contributing 27 unit / 26 e2e; frontend
typecheck, lint and production build clean (23 routes), HTTP smoke on the three new routes.

**Known limitations** — see §6 (notably: no storefront checkout, no gateway, shipping is stored data,
HTML-print invoices, coupons/tax breakdown pending, no multi-document transactions).

**Next module** — **Customer Management**: a customer list and profile built from `users` plus the
orders/refunds already snapshotted here (lifetime value, order count, last order), with the same
admin layout and isolation rules. Per your instruction, it has **not** been started — Order
Management is complete and verified first.
