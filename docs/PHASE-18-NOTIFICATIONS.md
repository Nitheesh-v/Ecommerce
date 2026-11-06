# Phase 18 — Notifications

A store that takes money owes people answers: the order arrived, the parcel shipped, the
payment failed, the refund is on its way. Until this phase the only answer was a page the
customer had to think to open, and the only "notification" was a bell in the admin header
promising alerts that did not exist.

Phase 18 builds the pipeline that turns real events into recorded messages — and, when
SMTP is configured, into email. One rule shapes all of it:

> **Record first, deliver second, and never let a message break the thing it describes.**

---

## 1. The record is the notification; the email is an attempt

Every notification is a row in a new `notifications` collection:

| Field | Why |
| --- | --- |
| `type`, `category` | the template that produced it, and what the console filters on |
| `audience` | `customer` (scoped to one `userId`) or `admin` (the shop's own alerts) |
| `title`, `body`, `link` | exactly what the in-app feed renders |
| `emailSubject`, `emailText`, `emailHtml` | the message that was (or was not) sent, kept so support can read it later |
| `emailStatus` | `delivered` / `failed` / `skipped` / `pending` — plus `emailError` and `attempts` |
| `readAt` | the unread badge |
| `dedupeKey` | unique when present: one event, one message |

Three consequences, all tested:

- a store with **no SMTP** still records everything and marks the email half `skipped`
  with the reason — it never claims a delivery that did not happen;
- a **failing relay** stores `failed` with the provider's own message, and the checkout
  it came from is untouched;
- a **replayed webhook** or a re-emitted status hits the unique `dedupeKey` and becomes a
  no-op instead of a second email.

## 2. Where the events come from

No business module was rewritten to know about notifications. The order lifecycle is
already published on `OrderEvents` (phase 11 built it for the payments refund mirror), so
the listener lives in the notifications module and simply subscribes:

```
OrdersService ──emitOrderPlaced──▶ ┐
OrdersService ──emitStatusChanged─▶ ├──▶ OrderNotificationsListener ──▶ NotificationsService
OrdersService ──emitRefundChanged─▶ ┘
```

`onOrderPlaced` is the one addition to the bus (fired exactly once, on the creation path
— the idempotent replay returns before it). Status changes map explicitly:

| order status | notification |
| --- | --- |
| `confirmed` | *Order … confirmed* (COD: keep the amount ready) |
| `shipped` | *Order … has shipped* — courier, AWB, ETA |
| `out_for_delivery` / `delivered` | delivery updates |
| `cancelled` | cancelled, with the reason and what happens to any payment |
| `processing`, return workflow | **nothing** — silence beats a fifth "we're on it" |

Because shipments advance the order through its own legal transitions, a parcel moving
to *shipped* or *delivered* notifies the customer with no extra wiring. The one shipment
state that changes no order — a failed delivery attempt — is announced from
`ShipmentsService` directly.

Four smaller emitters, each one call:

- **payments** — a payment that transitions to `failed` (only when it really transitioned)
  tells the customer their order is saved and payable from *My orders*;
- **reviews** — a submitted review lands in the operator feed, in-app only;
- **inventory** — the existing `InventoryNotifier` seam now writes a real operator alert
  (`inventory_low` / `inventory_out`) instead of a log line, deduplicated per
  product + level so a busy day is one alert, not forty;
- **auth** — a welcome message on sign-up.

`notify()` never throws. Every emitter could therefore be written as a plain `await` with
no try/catch, and none of them needs to know whether email exists.

## 3. Templates: pure, escaped, one source for the feed and the inbox

`renderNotification(type, data, store, recipient)` returns the title, body, link, subject
and both email bodies. It takes no database and no clock, so any stored row can be
reproduced exactly — which is what the console shows.

- Money is formatted **from paise**, once, with `Intl.NumberFormat` — a template that
  multiplied by 100 again would invoice a hundred times the amount.
- Everything interpolated into HTML is escaped (`<script>` in a cancellation reason stays
  text); the plain-text body deliberately keeps the raw characters.
- Links are relative in-app (`/account/orders/…`) and made absolute in email
  (`https://shop.example/account/orders/…`), because an inbox cannot resolve a path.
- Operator rows link to the console (`/admin/orders/…`, `/admin/inventory`, `/admin/reviews`).

## 4. Email: real SMTP or an honest no-op

`MailSender` is an abstract provider (the DI token), chosen at boot from configuration:

- `SMTP_HOST` + `MAIL_FROM` present → `SmtpMailSender`, a nodemailer transport reused
  across sends, with `replyTo` set to the envelope sender; failures surface as
  `MailDeliveryError` carrying the relay's own message.
- Otherwise → `NoopMailSender`, which reports `configured: false` and never pretends.

Environment validation refuses a half-configured mail server at **boot**: `MAIL_FROM` is
required with `SMTP_HOST`, and `SMTP_USER`/`SMTP_PASSWORD` must be set together. That is
the same reasoning as the Razorpay and courier checks — a configuration that only fails at
the first real send is a trap.

The console states the transport next to the cards (`Email via smtp …` or a warning panel
that names the variables to set), and `POST /api/admin/notifications/:id/retry` refuses
with `400` while SMTP is unconfigured and `409` when the message was already delivered.

## 5. API

**Customer** (`JwtAuthGuard` + `ActiveAccountGuard`, scoped to the caller):

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/api/notifications` | newest first; `unread` travels in `meta`, next to pagination |
| `GET` | `/api/notifications/unread-count` | the badge |
| `POST` | `/api/notifications/:id/read` | someone else's id is a `404` |
| `POST` | `/api/notifications/read-all` | `{ updated }` |

**Admin** (`@Roles(Admin)`):

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/api/admin/notifications` | `audience`, `type`, `category`, `emailStatus`, `unreadOnly`, `search`, `from`/`to`, paging |
| `GET` | `/api/admin/notifications/stats` | totals, unread, email outcomes, last 24 h, transport |
| `POST` | `/api/admin/notifications/:id/read` | shop rows only |
| `POST` | `/api/admin/notifications/:id/retry` | re-attempts the email |

There is **no create endpoint**: a client that can mint notifications can mint a fake
order confirmation. The `audience=customer` view exists so an operator can answer "did
they get the shipping mail?" — it is admin-only, and a customer sees only their own feed.

## 6. Storefront and console

- **`/account/notifications`** — All / Unread tabs with the count, category icons, an
  unread dot, relative times, paging, and "Mark all read". Opening an item marks it read
  (optimistically, reverting if the API refuses), because a list you must tick one row at
  a time is a list nobody clears. Empty, loading and error states are explicit.
- **Header bell** — appears for a signed-in shopper, shows the unread count (9+ above
  nine), and refreshes when the tab regains focus rather than polling.
- **`/admin/notifications`** — five cards (total, unread, emails sent, emails failed, last
  24 h), search and filters for audience/type/category/email state/unread/dates, a table,
  and a detail panel showing the exact subject and body that was sent with its delivery
  state and a **Retry email** button. The nav item is live (it was a "Soon" placeholder).
- **Admin header bell** — the latest five shop alerts, loaded when the popover opens; the
  placeholder promise ("will appear once the notifications module ships") is gone.

## 7. Verification

| Suite | Result |
| --- | --- |
| Backend `npm run verify` | typecheck, lint, **264 unit**, **355 e2e**, production build — green |
| `src/modules/notifications/notifications.service.spec.ts` | 17 — record-then-send, skipped without SMTP, failure recorded not thrown, `dedupeKey`, admin in-app-only alerts, feed scoping, mark read/all, admin filters, retry refusals and success, transport description, plus template money/escaping/link/greeting rules |
| `test/notifications.e2e-spec.ts` | 19 — auth and role checks, welcome on registration, order placed → customer + shop rows, cancellation copy, replay dedupe, feed paging and `unreadOnly=false`, ownership isolation, admin filters/stats/mark/retry, and a second app with **no mail transport** proving the record survives |
| Frontend | typecheck, lint, build — green; **50 routes** (was 48): `/account/notifications`, `/admin/notifications` |

The e2e suite replaces `MailSender` with a recorder, so it asserts both the "delivered"
and the "skipped" halves of the design rather than trusting the config.

## 8. Deliberately not built

- **SMS / push / WhatsApp.** Each is a provider with its own delivery receipts and its own
  opt-in rules; a channel that half-works is worse than none.
- **Marketing email and unsubscribe flows.** Everything here is transactional, sent because
  of something the customer did. Marketing needs consent, a suppression list and an
  unsubscribe link — a separate feature, not a template.
- **A queue.** Sending happens inline after the write, which is fine at this volume; the
  row is already the outbox, so moving delivery to a worker later changes one method.
- **Per-customer preferences.** With only transactional mail there is nothing legitimate to
  turn off. Adding a switch that hides a delivery notification would be a support ticket
  generator.
- **Digests and scheduling.** Nothing to digest yet; the console's date filters are the
  read side of "what happened".
