# Phase 12 — Shipping & Delivery Management

> **Scope:** production-ready shipping for a **single-vendor** store on the existing
> stack (Next.js App Router + Tailwind, NestJS, MongoDB/Mongoose). A shipping
> console, a shipment state machine that legally advances the order, a courier
> integration seam that never invents tracking data, and a customer tracking page.
>
> **Result:** `/admin/shipping` (summary cards, table, search/filter/sort, create
> dialog), `/admin/shipping/[id]` (detail, timeline, status and courier actions),
> `/account/orders/[id]/tracking`, eight APIs, 26 new e2e tests and 12 new unit
> tests. Backend `npm run verify` green (180 unit / 241 e2e), frontend typecheck +
> lint + build green.

## 1. Inspection findings (before any code)

The shipping *surface* already existed inside the order module; the phase adds a
dedicated module rather than a second source of truth.

| Found | Where | Reused as |
| --- | --- | --- |
| `order.shipping = { provider, trackingNumber, trackingUrl, shippedAt, estimatedDelivery, deliveredAt, notes[] }` | `schemas/order.schema.ts` | The order-side mirror of the shipment |
| `order.shippingMethod`, `order.shippingCharge` | same | Checkout facts, untouched |
| Address frozen at checkout | `order.shippingAddress` | Copied server-side when a shipment is created; never re-entered |
| `OrdersService.updateShipping()` (audited) | `orders.service.ts` | Kept as the manual escape hatch; the shipment console is the new path |
| Order state machine (`ALLOWED_TRANSITIONS`, `FULFILMENT_FLOW`) | `order-status.ts` | `promoteFulfilment()` walks it one legal step at a time |
| Admin UI kit, `use-*-list` hook pattern, payments console | `components/admin/*` | Same components, same loading/error/empty conventions |
| Courier mentions | order dialog placeholder only | Replaced by a real provider registry |
| Auth, guards, error envelope, pagination util | `common/*` | Unchanged |

Deliberately **not** duplicated: no second address model, no second payment status,
no courier-specific tracking table, no webhook endpoint.

## 2. Data model

### `shipments` — one document per parcel

```ts
{
  shipmentNumber: 'SHP-20261104-0001',   // atomic per-day counter
  orderId, orderNumber,                   // order reference (validated)
  userId, customerName, customerEmail,    // searchable projection
  shippingAddress: { recipientName, phone, line1, line2?, city, state, postalCode, country },
  courier: { provider: 'manual'|'shiprocket'|'delhivery'|'bluedart', name, trackingNumber?, trackingUrl? },
  status,                                 // see §4
  shippingCost,                           // minor units
  weightGrams?, dimensions? { lengthCm, widthCm, heightCm },
  notes?,                                 // internal — never sent to customers
  estimatedDelivery?, shippedAt?, actualDelivery?, failureReason?,
  createdBy? { userId, email }, updatedBy? { userId, email },
  events: [{ eventId, type, from?, to?, note?, reason?, source, by?, at }],
  createdAt, updatedAt
}
```

Indexes:

- `{ orderId: 1 }` **partial unique** where `status != 'returned_to_sender'` →
  *one live shipment per order*, enforced by the database, not by a read-check.
- `{ createdAt: -1 }`, `{ status: 1, createdAt: -1 }`, `{ estimatedDelivery: 1 }`,
  `{ 'courier.trackingNumber': 1 }`, `{ shipmentNumber: 1 }` (unique).

### Order changes (additive only)

None to the schema: `order.shipping` is a mirror written by `applyShipmentMirror()`
(`provider`, `trackingNumber`, `trackingUrl`, `shippedAt`, `estimatedDelivery`,
`deliveredAt`). A mirror never changes `order.status` — `promoteFulfilment()` does,
and only through `ALLOWED_TRANSITIONS`.

## 3. Backend

Module: `src/modules/shipments/`

```
shipments.module.ts              imports OrdersModule + UsersModule; provides ActiveAccountGuard
admin-shipments.controller.ts    /api/admin/shipments (admin only)
order-tracking.controller.ts     /api/orders/:id/tracking (owner only, active account)
shipments.service.ts             rules, projections, order coupling
schemas/shipment.schema.ts       document, subdocs, indexes, counter
shipment-status.ts               transitions, labels, flow, delayed rule
courier/courier-provider.ts      CourierRegistry (config-driven, no network)
repositories/shipments.repository.ts       abstract contract + record types
repositories/mongo-shipments.repository.ts aggregation summary, regex search, guarded updates
dto/*                            create / status / courier / query validation
```

### 3.1 Creation guards

1. Order must exist (`404` otherwise) and be `confirmed` or `processing` (`409`).
   A **replacement** is allowed for `shipped`/`out_for_delivery` orders **only** when
   the previous shipment ended `returned_to_sender`.
2. Money before parcels: `paymentStatus === 'paid'` **or** method `cod`/`manual`
   (`409`). Payment status is read, never written.
3. One live shipment per order (`409`, message names the existing shipment). A
   concurrent double-click is caught by the unique index → `create()` returns
   `null` → `409`.
4. Address: required fields non-blank, phone matches `^\+?[0-9][0-9 ()-]{6,19}$`,
   country defaults to India (`400`). The address is **copied from the order**;
   a client-sent `shippingAddress` is rejected by the whitelist (`400`).
5. A tracking link requires a tracking number (`400`).

### 3.2 Status transitions

`ALLOWED_SHIPMENT_TRANSITIONS`:

```
pending           → ready_to_ship
ready_to_ship     → shipped
shipped           → in_transit | out_for_delivery | delivered | delivery_failed
in_transit        → out_for_delivery | delivered | delivery_failed
out_for_delivery  → delivered | delivery_failed
delivery_failed   → shipped | in_transit | out_for_delivery | delivered | returned_to_sender
delivered         → (terminal)
returned_to_sender→ (terminal)
```

Enforced in the service **and** in the repository (`findOneAndUpdate` with a
status guard), so two admins clicking at once produce one transition and one
`409`, never two history entries.

Extra rules:

- same status → `400`;
- `delivery_failed` / `returned_to_sender` require a reason (`400`);
- `shipped` requires a courier name **and** a tracking number (`400`);
- every change writes an event in the same atomic update (`created`, `status`,
  `courier`, `note`) with `source: 'admin'`, `by` and `at`;
- `shippedAt` is stamped on the first `shipped`; `actualDelivery` defaults to now.

### 3.3 Order coupling

| Shipment | Order promotion |
| --- | --- |
| `shipped` | → `shipped` |
| `in_transit`, `out_for_delivery` | → `out_for_delivery` |
| `delivered` | → `delivered` |
| everything else | no status change; mirror updated only |

`promoteFulfilment(id, target, actor, reason?)`:

- returns unchanged when the order is already at the target;
- **refuses** `cancelled` / `returned` / `return_requested` orders;
- walks `FULFILMENT_FLOW` one legal step at a time (e.g. `confirmed → processing →
  shipped`), so the order's own history stays truthful;
- refuses a path that does not exist (`409`).

A cancelled order therefore keeps its status when its parcel moves; the service
logs the divergence and the console shows both statuses side by side. Money is
never touched: payments, refunds and COD stay on their own axis.

### 3.4 Courier integration

`CourierRegistry` reads configuration only — no credentials, no calls, no fake
data.

| Provider | Enabled when | Automated |
| --- | --- | --- |
| `manual` | always | no |
| `shiprocket` | `SHIPROCKET_EMAIL` + `SHIPROCKET_PASSWORD` | yes |
| `delhivery` | `DELHIVERY_API_TOKEN` | yes |
| `bluedart` | `BLUEDART_API_KEY` + `BLUEDART_LICENCE_KEY` | yes |

- Disabled provider → `503` naming the **missing variables** (`requireEnabled`).
- The console lists every partner with `enabled` and `missingConfiguration`.
- Partial configuration aborts boot (`env.validation.ts` pair checks).
- **No webhook endpoint.** Manual workflow only: an operator assigns the partner,
  the AWB and records each scan. Nothing is simulated.

### 3.5 API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/admin/shipments` | page, limit, search, status, courier, from, to, delayed, sortBy, sortOrder |
| GET | `/api/admin/shipments/summary` | total, readyToShip, shipped, inTransit, outForDelivery, delivered, delayed, failed |
| GET | `/api/admin/shipments/couriers` | providers + `manualOnly` |
| GET | `/api/admin/shipments/eligible` | shippable orders (search, limit) |
| POST | `/api/admin/shipments` | create |
| GET | `/api/admin/shipments/:id` | detail (order, address, events, staff identities) |
| GET | `/api/admin/shipments/:id/history` | append-only events |
| PATCH | `/api/admin/shipments/:id/status` | validated transition |
| PATCH | `/api/admin/shipments/:id/courier` | assign/correct, refused when finalised |
| GET | `/api/orders/:id/tracking` | customer-safe, owner only |

Search covers shipment number, order number, customer name/email, courier name and
tracking number (regex-escaped). `courier` accepts the provider id **or** the
printed partner name. Errors use the existing envelope
(`{ success: false, message, details?, requestId }`).

### 3.6 Customer projection

`TrackingView` contains: order and shipment numbers, status + label, courier name,
tracking number, tracking URL, estimated/shipped/actual dates, failure reason,
`progress`, `steps[6]`, and an event list of **statuses and times only**.

Never included: `shippingCost`, `notes`, `address`, `createdBy`/`updatedBy`, admin
email, `source`, event `note`/`reason` (the reason is surfaced separately as
`failureReason` because the customer needs it). Ownership is decided by
`OrdersService.getOrderRecordFor()`: another customer's order is a **`404`**, not a
`403`, so ids cannot be probed.

## 4. Status model

Three independent axes, on purpose:

1. **`order.status`** — fulfilment, advanced only by legal order transitions;
2. **`order.paymentStatus` / payments** — money, unchanged by shipping;
3. **`shipment.status`** — the parcel.

`delayed` is **derived**, never stored: status is in flight *and*
`estimatedDelivery < now`. `failed` in the summary = `delivery_failed` +
`returned_to_sender`.

## 5. Frontend

### `/admin/shipping`

- Seven cards: Total, Ready to ship, Shipped, In transit, Out for delivery,
  Delivered, Delayed/failed (clicking one filters the table).
- Manual-mode banner when only the manual courier is configured.
- Table: Shipment ID, Order ID, Customer, Courier partner, Tracking number,
  Shipping date, Expected delivery, Delivery status (with delayed and failure
  badges), Actions. Sortable columns plus a sort select that writes the same
  fields.
- Search (debounced), status, courier, date range, "delayed only", reset,
  pagination, skeleton rows, error state with retry, empty state (with and
  without filters), responsive (`min-w` table inside a scroll container).
- "Create shipment" dialog: eligible-order picker (server-driven, searchable),
  enabled providers only, courier name, AWB, tracking URL, cost (₹ → paise),
  weight, dimensions, ETA, internal notes. It never accepts an address.

### `/admin/shipping/[id]`

Order + customer links, address card, courier/tracking card with external link,
cost/weight/dimensions, status/payment badges, four date rows, failure reason,
internal notes, order items, and the append-only timeline (who/what/when/source).
Actions: **Update status** (only legal next steps, reason required for failures,
optional delivery date) and **Courier** (disabled once finalised).

### `/account/orders/[id]/tracking`

Customer-safe view: headline status, shipment number, ETA/delivered date, courier,
tracking number (linked only when the courier supplied a URL), failure reason, a
six-step progress rail, and the update feed. 401/403 renders "sign in to track this
order"; 404 renders "no tracking yet"; retry on transient errors. Nothing here can
change a status.

### Navigation

"Sales → Shipping" is now `available: true` (was absent from the sidebar).

## 6. Verification

```
backend:  npm run verify    → type check ✓, lint ✓, 180 unit ✓, 241 e2e ✓, build ✓
frontend: npm run typecheck ✓, npm run lint ✓, npm run build ✓ (routes incl.
          /admin/shipping, /admin/shipping/[id], /account/orders/[id]/tracking)
```

New tests:

- `test/shipments.e2e-spec.ts` — 26 tests: admin authz on every route, customer
  403s, creation + address copy + mirror, unknown/malformed order refs, wrong order
  statuses, unpaid card vs unpaid COD, duplicate live shipment, tracking link
  without AWB, incomplete address, courier assignment + history + mirror, courier
  change after delivery, illegal jump, repeated status, ship without AWB,
  full happy path advancing the order, failure branch + re-attempt, return to
  sender + replacement, cancelled order untouched, summary, search/filters,
  eligible orders, courier availability, customer tracking projection (no notes,
  no cost, no staff emails), foreign order 404, missing shipment 404, anonymous
  401, suspended account 403, detail contract.
- `src/modules/shipments/shipment-status.spec.ts` — 6 tests: one-step transitions,
  failure branch, terminal states, every target exists and is labelled, progress
  order, delayed derivation.
- `src/modules/shipments/courier/courier-provider.spec.ts` — 6 tests: manual always
  enabled, declared-but-disabled partners with named variables, all-or-nothing
  enabling, `requireEnabled` message, unknown provider, label resolution.
- `test/support/in-memory-shipments.repository.ts` — mirrors the Mongo repository:
  partial unique rule, optimistic guards, search/filter/sort, summary.

## 7. Security checklist

- Shipment and order ids validated (`@IsMongoId`, existence checks).
- Duplicate live shipments impossible (service check + partial unique index).
- Status changes are validated transitions with an optimistic guard; history is
  append-only and written atomically with the change.
- Admin routes: `@Roles(Role.Admin)` + JWT guard. Customer tracking:
  authenticated, owner-scoped, suspended accounts blocked by `ActiveAccountGuard`.
- Customers cannot write anything: the tracking controller has a single `GET`.
- Internal notes, costs and staff identities never reach the customer projection
  (asserted in e2e by serialising the whole response).
- Addresses are copied server-side; the create DTO cannot accept one.
- Courier credentials are optional and server-side only; the browser receives a
  provider list with `enabled`/`missingConfiguration`, never a secret.
- Tracking links must be `http(s)` URLs; `target="_blank"` uses
  `rel="noopener noreferrer"`.
- No fake tracking data: nothing is generated, nothing is back-dated.
- Opening a page changes nothing — delivery is a recorded action, not a render.

## 8. Environment variables

All optional; empty values keep the manual workflow:

```env
SHIPROCKET_EMAIL=
SHIPROCKET_PASSWORD=
DELHIVERY_API_TOKEN=
BLUEDART_API_KEY=
BLUEDART_LICENCE_KEY=
```

A partial pair aborts boot with the missing variable named. Documented in
`backend/.env.example` (§ Courier partners).

## 9. What still needs real credentials / manual setup

1. **Courier account** (Shiprocket / Delhivery / Blue Dart): until credentials
   exist, the manual workflow is the production path — assign a partner, enter the
   AWB, update statuses as scans arrive.
2. **Provider adapters**: `trackingUrlTemplate` is left unset because partner
   tracking URL formats are not documented here. When a partner is contracted,
   implement booking/cancellation/label calls behind `CourierRegistry` and add the
   provider to the registry — the module is ready for it, and no fake adapter ships.
3. **Storefront sign-in**: the `(auth)` group (login/register) is still a later
   phase, so `/account/orders/[id]/tracking` shows a "sign in" state for anonymous
   visitors. The API and the page are complete; they simply wait for the customer
   authentication UI.
4. **Notifications**: dispatch/shipped/delivered emails/SMS are not part of this
   phase (no SMTP is configured).

## 10. Known issues & deliberate decisions

- **No courier webhook endpoint.** Confirmed with the store owner: without a
  contracted integration and a verifiable signature scheme, an inbound endpoint
  would only invite forged updates. Manual updates are audited; adding a webhook
  later means adding a signature check plus idempotency on `eventId`.
- **One live shipment per order.** Replacement only after `returned_to_sender`,
  at which point the order is often already `shipped`/`out_for_delivery`, so
  creation for those two statuses is permitted *only* in that replacement case.
- **`delivered` and `returned_to_sender` are terminal.** A parcel that comes back
  does not become delivered later; the order-side return flow owns that story.
- **Courier change is refused after delivery** — the AWB on a completed delivery
  is a historical fact.
- **`in_transit` has no separate order status.** The order machine has no such
  state, so `in_transit` promotes to `out_for_delivery` (the nearest legal step).
- **Order-side divergence is logged, not forced.** If an order was cancelled while
  a parcel was moving, the parcel keeps moving and the order stays cancelled.
- **The old `updateShipping` endpoint remains.** It is the order console's manual
  override, still audited; the shipping module supersedes it for day-to-day work.

## 11. Completion report

### Files created (backend)

```
src/modules/shipments/shipments.module.ts
src/modules/shipments/admin-shipments.controller.ts
src/modules/shipments/order-tracking.controller.ts
src/modules/shipments/shipments.service.ts
src/modules/shipments/shipment-status.ts
src/modules/shipments/shipment-status.spec.ts
src/modules/shipments/schemas/shipment.schema.ts
src/modules/shipments/courier/courier-provider.ts
src/modules/shipments/courier/courier-provider.spec.ts
src/modules/shipments/repositories/shipments.repository.ts
src/modules/shipments/repositories/mongo-shipments.repository.ts
src/modules/shipments/dto/create-shipment.dto.ts
src/modules/shipments/dto/update-shipment.dto.ts
src/modules/shipments/dto/shipments-query.dto.ts
test/shipments.e2e-spec.ts
test/support/in-memory-shipments.repository.ts
```

### Files created (frontend)

```
src/types/shipment.ts
src/services/admin/shipments.service.ts
src/services/store/tracking.service.ts
src/hooks/use-shipment-list.ts
src/components/admin/shipping/shipment-badges.tsx
src/components/admin/shipping/shipment-summary-cards.tsx
src/components/admin/shipping/shipments-filters.tsx
src/components/admin/shipping/shipments-table.tsx
src/components/admin/shipping/shipment-create-dialog.tsx
src/components/admin/shipping/shipment-status-dialog.tsx
src/components/admin/shipping/shipment-courier-dialog.tsx
src/components/admin/shipping/shipment-timeline.tsx
src/components/admin/shipping/shipment-detail-view.tsx
src/components/admin/shipping/shipments-view.tsx
src/components/store/order-tracking-view.tsx
src/app/admin/(console)/shipping/page.tsx
src/app/admin/(console)/shipping/[id]/page.tsx
src/app/(store)/account/orders/[id]/tracking/page.tsx
```

### Files modified

```
backend/src/app.module.ts                 registers ShipmentsModule
backend/src/config/env.validation.ts     optional courier vars + pair checks
backend/src/modules/orders/orders.service.ts
                                         promoteFulfilment(), applyShipmentMirror(),
                                         findFulfilmentPath()
backend/test/support/create-test-app.ts   Shipment model token + repository override
backend/.env.example                      courier block
frontend/src/components/admin/layout/nav-config.ts
                                         Sales → Shipping (available)
docs/PHASE-12-SHIPPING.md                 this report
README.md                                 status + module list
docs/ARCHITECTURE.md                      shipping section
```

### Commands

```
cd backend  && npm run verify
cd frontend && npm run typecheck && npm run lint && npm run build
```
