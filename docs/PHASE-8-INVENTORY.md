# Phase 8 — Inventory Management

> Status: **implemented and verified.** Stock is no longer edited as a product field: it has one
> owner (`InventoryService`), one atomic write path, and an append-only audit trail.

---

## 1. Inspection findings

Read before writing code — this module deliberately does **not** introduce a second quantity.

| Found | Where | Consequence for this phase |
| --- | --- | --- |
| `stock` (`Number`, required, min `0`, default `0`, index `{ stock: 1 }`) and `lowStockThreshold` (default `5`) already live on the product | `backend/src/modules/products/schemas/product.schema.ts` | Kept as the **single source of truth**. No `inventories` collection. |
| `ProductsService.create()` wrote `stock` from the DTO; `update()` wrote `stock` **and** `lowStockThreshold` straight through | `products.service.ts` | `stock` removed from the update contract; `lowStockThreshold` stays editable but re-evaluates alerts. |
| A local `stockStatusOf()` helper already derived in/low/out for product views | `products.service.ts` | Same three-state definition reproduced in the inventory repository, and the UI reads the API's value instead of recomputing. |
| The dashboard already aggregates `0 < stock ≤ lowStockThreshold` | `admin/repositories/mongo-dashboard.repository.ts` | Reused as the definition of "low", unchanged. |
| `price` / `salePrice` / `costPrice` are integer paise; `costPrice` is admin-only | product schema + public projections | Inventory value is computed at `costPrice` and never leaves the admin API. |
| Admin auth is `@Roles(Role.Admin)` + global `RolesGuard`; the actor is available via `@CurrentUser()` | `common/decorators/*` | Every write records the admin's id and email. |
| No orders module yet | `src/modules` | Order/cancellation/refund behaviour ships as **service hooks** (`reserveForOrder`, `restockForOrder`) with idempotency, ready for Phase 9. |

---

## 2. Backend

### 2.1 Files

```
backend/src/modules/inventory/
├── inventory.module.ts                       # wiring + DI tokens
├── inventory.controller.ts                   # /api/admin/inventory (admin only)
├── inventory.service.ts                      # the only place stock changes
├── inventory.notifier.ts                     # alert notification seam
├── inventory.service.spec.ts                 # 22 unit tests
├── dto/
│   ├── adjust-stock.dto.ts                   # productId, action, quantity, reason, notes, referenceId
│   └── inventory-query.dto.ts                # table query + movement query
├── schemas/
│   ├── inventory-movement.schema.ts          # append-only audit rows
│   └── inventory-alert.schema.ts             # deduplicated open alerts
└── repositories/
    ├── inventory.repository.ts               # abstract contract (DI token) + view types
    └── mongo-inventory.repository.ts         # atomic Mongo implementation
```

Supporting changes:

| File | Change |
| --- | --- |
| `app.module.ts` | registers `InventoryModule` |
| `products/products.module.ts` | imports `InventoryModule` (no cycle: inventory never imports products) |
| `products/products.service.ts` | injects `InventoryService`; logs opening stock on create, refreshes alerts when the threshold changes, no longer writes `stock` |
| `products/dto/update-product.dto.ts` | `PartialType(OmitType(CreateProductDto, ['stock']))` — `PATCH { stock }` is now a **400** |
| `products/admin-products.controller.ts` | passes the acting admin into `create()` |
| `test/support/in-memory-inventory.repository.ts` | in-memory fake over the *same* product store |
| `test/support/create-test-app.ts` | `inventory` override + model stubs |
| `test/inventory.e2e-spec.ts` | 26 e2e tests |

### 2.2 Endpoints

All under `/api/admin/inventory`, guarded by `@Roles(Role.Admin)` (401 anonymous, 403 customer).
Lists use the shared envelope: `{ success, data, meta: { page, limit, total, totalPages, … } }`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Inventory table — `search` (name **or** SKU), `categoryId`, `stockStatus` (`in\|low\|out`), `sortBy` (`quantity\|name\|price\|updatedAt`), `sortOrder`, `page`, `limit` |
| `GET` | `/summary` | Total products, total units, in/low/out counts, inventory value (cost), retail value, units by category, top low-stock, open alert counts |
| `GET` | `/low-stock` | `0 < quantity ≤ threshold` |
| `GET` | `/out-of-stock` | `quantity = 0` |
| `GET` | `/alerts` | Open, deduplicated alerts (`?level=low\|out`) |
| `GET` | `/history` | Audit trail — `productId`, `type`, `search` (name/SKU/reference), `from`, `to`, pagination |
| `GET` | `/products/:productId` | Fresh quantity for the adjust dialog |
| `POST` | `/adjust` | `{ productId, action: increase\|decrease\|set, quantity, reason, notes?, referenceId? }` |

There is **no** update or delete route for movements; `PATCH`/`DELETE` on a movement id answer `404`
(asserted in the e2e suite).

### 2.3 Schema

**`inventory_movements`** — append-only audit rows (snapshotted product data so editing a product
never rewrites history):

| Field | Type | Notes |
| --- | --- | --- |
| `productId` | ObjectId | ref `Product` |
| `productName`, `sku` | string | immutable snapshot |
| `type` | `initial \| adjustment \| order \| cancellation \| return \| correction` | |
| `reason` | `new_stock \| damaged \| manual_correction \| returned \| purchase_return \| other` | admin adjustments |
| `notes` | string(≤500) | optional |
| `direction` | `increase \| decrease` | |
| `previousQuantity` / `changedQuantity` / `newQuantity` | number | `changedQuantity` is signed |
| `performedBy` | `{ userId, email } \| null` | `null` = system event |
| `referenceId`, `source` | string | idempotency key + origin (`admin`, `catalog`, `order`) |
| `createdAt` | Date | no `updatedAt` |

Indexes: `{ productId, createdAt: -1 }`, `{ createdAt: -1 }`, `{ type, createdAt: -1 }`, and a
**partial unique** `{ referenceId, type }` (`uniq_reference_type`) for replay protection.

**`inventory_alerts`** — one row per open problem:

| Field | Type |
| --- | --- |
| `productId`, `productName`, `sku` | snapshot |
| `level` | `low \| out` |
| `status` | `open \| resolved` |
| `quantity`, `lowStockThreshold` | context at open time |
| `resolvedAt` | Date \| null |

Unique **partial** index `{ productId, level }` where `status: 'open'` — a product can never have two
open alerts of the same level, so repeated updates cannot spam the feed.

### 2.4 Adjustment logic

```
POST /adjust
  ├─ validate: quantity ≥ 1 for increase/decrease, ≥ 0 for set (also enforced by the DTO)
  ├─ load product            → 404 when unknown
  ├─ apply the mutation atomically:
  │    increase → findOneAndUpdate({_id}, { $inc: { stock: +n } })
  │    decrease → findOneAndUpdate({_id, stock: { $gte: n } }, { $inc: { stock: -n } })   ← guard in the filter
  │    set      → findOneAndUpdate({_id}, { $set: { stock: n } })
  │    (all three also refresh `updatedAt`)
  ├─ no-op guard: a `set` to the current value is rejected instead of writing an empty audit row
  ├─ append the movement (previous/new quantities come from the same atomic pre-image)
  ├─ sync alerts (open/escalate/resolve) and notify only on a real state change
  └─ return { previousQuantity, newQuantity, changedQuantity, stockStatus, movement, alert }
```

**Never negative.** The `stock: { $gte: n }` predicate is part of the *write*, not a preceding read:
two concurrent decreases of the last unit produce one success and one `409`, never `-1`. The e2e
suite fires ten parallel decrements at a 5-unit product and asserts exactly five `201`s, five `409`s
and a final quantity of `0`.

**Never trusted from the client.** The API accepts an intent (`increase` / `decrease` / `set`), not a
resulting quantity, and re-reads the product inside the same operation. A stale table row can only
ever produce a stale *preview* — the write is always computed from the live value.

**Idempotent replays.** Every movement may carry a `referenceId`. `(referenceId, type)` is unique, so:

1. the service checks for an existing movement first and returns `duplicate` without touching stock;
2. if a race slips through, the unique index rejects the audit insert;
3. the service then **compensates** the stock write it just made (`applyDelta(-delta)`), so a lost
   race can never leave stock changed but unaudited.

### 2.5 Alerts (deduplicated, notification-ready)

- Level is derived with the same three-state rule as the table.
- Opening: `out` resolves any open `low` first (escalation), then upserts; `low` resolves `out`.
- Repeated updates *within* the same state update the snapshot quantity only — no new row, no
  notification.
- Restocking above the threshold resolves every open alert for the product.
- Threshold edits re-evaluate alerts (`ProductsService.update` → `InventoryService.refreshAlerts`).
- Notifications are a seam: `InventoryNotifier.alertOpened/alertResolved` logs today; swapping the
  provider for email/Slack/queue needs no inventory change. Alerts are persisted **before** the
  notification, so a failed send never loses the alert.

### 2.6 Order integration status

The order module does not exist yet, so **no route** wires this up — by design. The contract Phase 9
must call:

```ts
// checkout / payment success
const result = await inventory.reserveForOrder({
  productId, quantity: item.quantity, referenceId: `order:${orderId}`,
});
if (result.status === 'insufficient') throw new ConflictException('Sold out');

// eligible cancellation (stable key — never a timestamp)
await inventory.restockForOrder({
  productId, quantity, referenceId: `order:${orderId}:cancel`, type: 'cancellation',
});

// refund / return restock
await inventory.restockForOrder({
  productId, quantity, referenceId: `refund:${refundId}`, type: 'return',
});
```

`reserveForOrder` decrements with the same guarded atomic write and records an `order` movement;
`restockForOrder` records `cancellation`/`return`. Both are idempotent per `(referenceId, type)`, so a
cancelled order delivered as three webhooks restocks **once** — unit-tested, including the
compensation path.

---

## 3. Frontend — admin console

| File | Purpose |
| --- | --- |
| `src/types/inventory.ts` | Types + labels for statuses, actions, reasons and movement types |
| `src/services/admin/inventory.service.ts` | `list`, `summary`, `alerts`, `history`, `productStock`, `adjust` |
| `src/hooks/use-inventory-list.ts` | Server-paginated table (debounced search, abortable, `loading` derived from the query key) + summary hook |
| `src/hooks/use-stock-history.ts` | Server-paginated audit trail |
| `components/admin/inventory/inventory-view.tsx` | Page: summary, alert banner, filters, table, pagination, CSV export, adjustments |
| `…/inventory-summary.tsx` | Five summary cards (products, units, low, out, **value at cost**) + stock-health bar + units-by-category bars |
| `…/inventory-filters.tsx` | Name/SKU search, category, stock status, sort (lowest/highest stock, name, recent, price) |
| `…/inventory-table.tsx` | Image, name, SKU, category, price, available + threshold, status badge, last updated, actions (view product, adjust, history) |
| `…/adjust-stock-dialog.tsx` | Modal: re-reads current stock, action + quantity, reason, notes, **live preview `12 → 17 (+5)`**, destructive warning, confirmation |
| `…/stock-history-view.tsx` / `…/stock-history-table.tsx` | Audit trail: product, SKU, movement, previous, changed, new, reason, reference, performed by, date |
| `app/admin/(console)/inventory/page.tsx` | `/admin/inventory` |
| `app/admin/(console)/inventory/history/page.tsx` | `/admin/inventory/history` (optional `?productId=` deep link) |
| `components/admin/layout/nav-config.ts` | Inventory flipped from "Soon" to an active nav item |
| `components/admin/products/product-form.tsx` | Create shows "Opening stock"; edit shows a **read-only** quantity with an "Adjust" link |

Loading skeletons, empty states (no products / no matches), error states with retry, success and
failure toasts throughout. Nothing is optimistically mutated: after an adjustment the table and the
summary are re-read from the API.

---

## 4. Verification

Backend (`cd backend`):

```
npm run verify
```

```
✓ Type check........ 3.3s
✓ Lint.............. 0.2s
✓ Unit tests........ 3.7s
✓ E2E tests......... 12.7s
✓ Production build.. 7.2s
All checks passed.
```

| Suite | Result |
| --- | --- |
| Unit | **105 passed** / 11 files (83 before + 22 in `inventory.service.spec.ts`) |
| E2E | **131 passed** / 9 files, including `inventory.e2e-spec.ts` **26 passed** |

Coverage against the brief:

| Requirement | Test |
| --- | --- |
| Increase | unit + e2e (`12 → 17`, movement `+5`) |
| Decrease | unit + e2e (`40 → 37`, movement `-3`) |
| Set exact | unit + e2e (`1 → 9`) |
| Negative prevention | unit (`409`, no stock change, no movement) + e2e + concurrent test |
| Low-stock calc | summary/list/low-stock endpoint (threshold boundary `5/5` counts as low) |
| Out-of-stock calc | summary/list/out-of-stock endpoint |
| History | previous/new/changed/reason/actor assertions, type + product + search filters |
| Unauthorized modification | 401 anonymous, 403 customer on read and adjust |
| Concurrent updates | 10 parallel decrements on 5 units → 5 succeed, 5 rejected, stock `0` |
| Duplicate order events | unit: same `referenceId` → second call `duplicate`, stock moved once |
| Duplicate cancellation events | unit: three replays → one restore |
| Stock restoration | unit: cancellation + refund restock, `9 → 12`, `→ 16` |
| Product update cannot bypass | e2e: `PATCH { stock }` → `400`, quantity unchanged |
| Append-only audit | e2e: `PATCH`/`DELETE` on a movement → `404` |
| Opening stock is audited | e2e: creating a product logs an `initial` movement |

Frontend (`cd frontend`):

```
npm run typecheck   → clean
npm run lint        → clean
npm run build       → 20 routes
/admin/inventory          ○
/admin/inventory/history  ◐
```

The production build was served on port 3013 against a stub API and smoke-tested:
`/admin/inventory`, `/admin/inventory/history`, `/admin/inventory/history?productId=…`,
`/admin/dashboard` and `/admin/login` all returned `200`. The console is behind a client-side auth
gate that renders a skeleton on the server, so HTTP-level smoke cannot exercise the populated table —
the data contract is covered by the backend e2e suite instead (no browser is available in this
environment).

---

## 5. Run it locally

```
cd backend && npm run start:dev      # http://localhost:5000/api
cd frontend && npm run dev           # http://localhost:3000
```

Then open `http://localhost:3000/admin/inventory`:

1. summary cards fill from `/api/admin/inventory/summary`;
2. pick a product → **Adjust** → choose type/quantity/reason → the preview shows the resulting stock;
3. **Confirm adjustment** → toast, table and cards refresh, and the movement appears under
   **Stock history**.

---

## 6. Known issues & decisions

1. **`products.stock` remains the source of truth.** A separate inventory collection would have
   introduced a second quantity to keep in sync; the audit trail (`inventory_movements`) records
   change history instead.
2. **`stock` is no longer writable through `PATCH /api/admin/products/:id`.** With `forbidNonWhitelisted`,
   sending it is an explicit `400` pointing at the inventory endpoint, rather than a silent strip.
   Opening stock on **create** is still accepted and logged as `initial`.
3. **Transactions are not used.** MongoDB standalone (the default local setup) has no transactions;
   the design relies on single-document atomic updates plus a compensation step for the rare lost
   race. A replica-set deployment could wrap apply+record in a session for belt-and-braces.
4. **`set` is not a conditional write.** "Set exact" is last-writer-wins by nature; that is correct
   for a physical stock count. Concurrent counts reconcile by the later timestamp in the audit trail.
5. **No bulk adjustment endpoint yet.** The brief asks for per-product adjustments; bulk restock
   (CSV import) would reuse `referenceId` for idempotency.
6. **Value uses `costPrice` and treats a missing cost as `0`.** Products without a cost price
   understate inventory value; the UI labels the card "At cost" and also shows the list-price value.
7. **CSV export is client-driven** (pages through `limit=100`), so a very large catalogue performs
   several requests; a server-side export job belongs with reporting.
8. **Alerts are surfaced on the inventory page only.** The overview dashboard keeps its existing
   low-stock panel; wiring the deduplicated alert feed into the dashboard/notifications centre is a
   Phase 12 concern.
9. **No reserve/commit split.** Checkout decrements directly (the guarded write already prevents
   overselling); a cart-level reservation window would need TTL documents and is deferred to the
   orders phase.
10. **No frontend test runner**, so the console is verified by typecheck/lint/build/smoke plus the
    backend contract suite.

---

## 7. Completion report

**Files created** — 7 backend source files + 1 unit spec + 1 e2e spec + 2 test-support files;
10 frontend files; this document.

**Files modified** — `app.module.ts`, `products.module.ts`, `products.service.ts` (+ spec),
`update-product.dto.ts`, `admin-products.controller.ts`, `create-test-app.ts`,
`in-memory-products.repository.ts`, `products.e2e-spec.ts`, `categories.e2e-spec.ts`;
`nav-config.ts`, `product-form.tsx`, `types/product.ts`, `README.md`, `docs/ARCHITECTURE.md`.

**APIs** — 8 admin endpoints (`/api/admin/inventory` + `summary`, `low-stock`, `out-of-stock`,
`alerts`, `history`, `products/:productId`, `POST adjust`).

**Schema** — `inventory_movements` (append-only, partial-unique replay key) and
`inventory_alerts` (partial-unique open alert per product+level); product `stock`/`lowStockThreshold`
unchanged.

**Adjustment logic** — atomic guarded `$inc`/`$set`, server-computed quantities, no-op and
negative guards, movement in the same flow, compensation on replay, alert sync after every change.

**Order integration** — hooks shipped and unit-tested; **not wired** because the order module does not
exist yet. Phase 9 must call `reserveForOrder` at checkout and `restockForOrder` on eligible
cancellations/refunds, with stable `referenceId`s.

**Tests** — backend 105 unit + 131 e2e green; frontend typecheck/lint/build clean.

**Known limitations** — see §6 (notably: no transactions, no bulk adjust, cost-based value,
client-side export, alerts only on the inventory page).

**Next module** — **Order Management & checkout** (`docs/PHASE-9-ORDERS.md`): order schema and state
machine, checkout that calls `reserveForOrder`, cancellation/refund flows that call
`restockForOrder`, and order history in the console. Not started, per the instruction to finish and
verify inventory first.
