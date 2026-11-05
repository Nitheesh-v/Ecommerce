# Phase 15 — Reports & Settings

Two things the console had been missing: a place to **tell the store how it works**
(identity, contact, money) and a place to **read the business back** (sales and
customers).

Scope was agreed up front: settings covers everything — including currency and
locale — reports cover sales and customers, and exports are CSV only.

---

## 1. Settings

### One document, not a key/value bag

`settings` holds exactly one record (`key: 'store'`). A key/value table would have
made every field a string and every read a loop; a typed document lets the schema
enforce the shape and lets the service validate the *merged* result.

| Field | Why it exists |
| --- | --- |
| `storeName`, `legalName` | storefront header, invoice header, transactional email |
| `supportEmail`, `supportPhone` | contact block, refund/return instructions |
| `address` | invoice and returns address |
| `invoiceFooter`, `orderNote` | invoice footer, post-checkout message |
| `currency`, `locale` | money and date formatting, everywhere |
| `taxRatePercent` | percentage added on the goods value at checkout |
| `flatShippingCharge`, `freeShippingThreshold` | shipping rules, **minor units** |
| `codEnabled` | whether cash-on-delivery is offered and accepted |
| `updatedBy`, `updatedAt` | who last changed the numbers |

### The database wins over the environment

Before this phase, pricing came from boot-time env (`DEFAULT_PRICING` /
`resolvePricingConfig()`), which meant a fee change needed a redeploy. Now:

1. Environment values seed the document **the first time nothing is stored**.
2. Every later read returns the stored document.
3. `SettingsService.pricing()` is the single accessor, and it answers from an
   in-memory copy invalidated on write — checkout does not pay a query per line.

`OrdersService` and `CouponsService` no longer read `this.pricing` from a constant;
they refresh it at the entry of anything that prices or renders money
(`refreshPricing()`), so a save applies to the **next** order.

### Existing orders are never rewritten

Checkout already snapshots everything it needs onto the order — line prices,
`taxAmount`, `taxRatePercent`, `shippingCharge`, `currency`. Changing a rate or a fee
therefore cannot rewrite history: an order placed yesterday keeps tomorrow's numbers
out of its totals. The same rule covers the settings document itself.

### Currency is effectively write-once

Every price in the catalogue and every order total is stored as **minor units of one
currency**. Switching `INR` → `USD` would not convert anything; it would relabel
₹1,299 as $1,299. So:

- `PATCH /api/admin/settings` refuses a currency change with `409` once **any**
  product or order exists, and says how many of each there are.
- `GET /api/admin/settings` reports `currencyLocked`, and the console disables the
  field with the reason attached rather than letting an admin discover it on save.
- An empty store (fresh install, or fixtures) can still set the currency.

`locale` is free to change at any time — it only affects formatting.

### Cash-on-delivery is enforced, not hidden

`codEnabled: false` does two things: the storefront can stop offering the option, and
`OrdersService.createOrder()` throws a `400` for a COD checkout. Hiding a button in
the browser is not a policy.

### Why the module has no feature imports

`SettingsModule` exports `SettingsService` and is imported by `OrdersModule` and
`CouponsModule`. It must not import them back, or the DI graph becomes a cycle. The
one thing settings needs from its neighbours — "does the store already hold data?" —
is answered by `SettingsRepository.dataFootprint()`: two `countDocuments()` calls on
the `orders` and `products` models, registered in this module for that purpose only.
No business logic crosses the boundary.

### Public projection

`GET /api/store/settings` returns name, contact, address, currency, locale and
`codEnabled` — what a storefront footer or checkout page may show. Tax rate, fees and
the moderator trail stay in `/api/admin/settings`.

---

## 2. Reports

Two reports, both over one date range (`today`, `7d`, `30d`, `90d`, or `custom`
with `from`/`to`), both admin-only.

### Sales

Composed from the dashboard's own repository, so the numbers cannot drift apart:

| Figure | Source |
| --- | --- |
| Revenue, orders, average order value, catalogue/customer counts | `DashboardRepository.getMetrics()` |
| Revenue and order series (gap-filled per day) | `getRevenueSeries()`, `getOrdersSeries()` |
| Status mix | `getOrderStatusDistribution()` |
| Sales by category | `getSalesByCategory()` |
| Top products | `getTopProducts()` |

Revenue means **paid orders** — the definition the dashboard already uses.

### Customers

The dashboard could not answer "new or returning?", so this is a new repository
(`CustomerInsightsRepository`) over the same `orders` collection:

| Figure | Definition |
| --- | --- |
| `newCustomers` | first **ever** order fell inside the range |
| `repeatCustomers` | more than one order inside the range |
| `activeCustomers` | distinct customers who ordered in the range |
| `repeatRate` | repeat ÷ active, one decimal |
| `ordersPerCustomer` | orders ÷ active, one decimal |
| `topCustomers` | ranked by non-cancelled order value, last order date included |

Two details worth keeping:

- A customer is keyed by `userId` when signed in, otherwise by lower-cased email — the
  same rule the coupon engine uses. Guest checkouts show `id: null`.
- "New" is **not** "first order in range": that is why a second, keyset-bounded query
  looks up each customer's global first order. Otherwise every returning customer
  would look new.

Cancelled orders are excluded from both reports. Refunded orders still count as
purchases.

### CSV

`GET /api/admin/reports/sales/export` and `/customers/export` return an attachment
named `sales-report-YYYY-MM-DD.csv` / `customer-report-YYYY-MM-DD.csv`, with the range
in the header block. Cells are quoted when they contain a comma, quote or newline, so
a category called `Shirts, tees` keeps its column. Rows are CRLF-terminated, matching
the customers and redemptions exports.

---

## 3. API surface

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/settings` | admin | settings + `currencyLocked` |
| `PATCH` | `/api/admin/settings` | admin | partial update of any field |
| `GET` | `/api/store/settings` | public | storefront-safe subset |
| `GET` | `/api/admin/reports/sales` | admin | sales report for a range |
| `GET` | `/api/admin/reports/customers` | admin | customer report for a range |
| `GET` | `/api/admin/reports/sales/export` | admin | sales CSV |
| `GET` | `/api/admin/reports/customers/export` | admin | customer CSV |

---

## 4. Frontend

- `/admin/settings` (`SettingsView` → `SettingsForm`) — four cards (profile, address,
  pricing, checkout), dirty tracking, discard, inline save confirmation, and a locked
  currency field with the reason. Fee fields are edited in major units and converted
  to minor units on save. The form is keyed on `updatedAt`, so a save remounts it with
  the stored values instead of synchronising a draft inside an effect.
- `/admin/reports` (`ReportsView`) — tab switch (sales/customers) over one shared
  `RangeFilter` (reused from the dashboard), an export button that downloads the CSV
  for the active tab, and panels that reuse the dashboard's chart components so a
  number looks the same wherever it appears.
- Money is formatted with the store's `currency`/`locale` from settings, not a
  hardcoded `en-IN`/`INR`.
- Both routes are enabled in `nav-config.ts`; both pages set `instant = false`.

---

## 5. Tests

| Suite | Count | Covers |
| --- | --- | --- |
| `src/modules/settings/settings.service.spec.ts` | 10 | seeding from env, caching, pricing from stored values, COD switch, currency normalisation, currency lock, merged validation, clearing optional text, invalidation, public projection |
| `src/modules/orders/orders.service.spec.ts` | +2 | COD refused when disabled (and nothing written), prepaid still accepted |
| `test/settings.e2e-spec.ts` | 10 | 401/403, seeded read, partial update, persistence, invalid tax/currency/locale, currency change allowed while empty, `409` once data exists, public subset |
| `test/reports.e2e-spec.ts` | 7 | 401/403 on every route, sales figures + 7 gap-filled buckets, invalid custom range, customer summary and guest key, both CSV exports (headers, quoted commas, no JSON envelope) |

Backend `npm run verify`: typecheck, lint, **204 unit**, **303 e2e**, build — green.
Frontend: typecheck, lint, build — green (`/admin/reports`, `/admin/settings`
prerendered).

Test support: `create-test-app.ts` gained `settings?` and `customerInsights?`
options, an `InMemorySettingsRepository` (starts empty, so the seeding path is what
runs) and an `InMemoryCustomerInsightsRepository` (empty store unless a suite supplies
fixtures). Settings and customer analytics are **always** substituted, because orders
price through settings and analytics would otherwise need Mongo.

---

## 6. Deliberately not built

- Inventory, coupon and review reports, and any email digest — out of the agreed scope
  (sales + customers only).
- Printable report view and a JSON export endpoint — CSV only was chosen.
- Currency conversion or multi-currency pricing. The field is per-store and locked once
  data exists; historical conversion is a migration, not a setting.
- A settings audit trail beyond `updatedBy`/`updatedAt`.
- Nightly rollups: reports aggregate live. At this data size that is correct and
  simple; the caching/queues phase is the right place to revisit it.
