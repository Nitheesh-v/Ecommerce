# Ecommerce — Single-Vendor E-Commerce Platform

Production-oriented, single-vendor e-commerce platform. Monorepo with a Next.js (App Router) storefront/admin and a NestJS REST API backed by MongoDB.

> **Status: Phase 17 (cart & checkout) complete.** Authentication with rotating refresh tokens, a guarded `/admin` console, the catalogue, categories, inventory, the full order lifecycle, customers, payments, shipping, offers, reviews, reports/settings, the shopper-facing storefront, and now a server-side cart with a three-step checkout — addresses, COD or Razorpay, server-computed totals, coupon re-validation and verified payments — are implemented and verified. Next: notifications.
> Docs: [`Architecture`](docs/ARCHITECTURE.md) · [`Phase 1`](docs/PHASE-1-INSPECTION.md) · [`Phase 2`](docs/PHASE-2-BOOTSTRAP.md) · [`Phase 3`](docs/PHASE-3-COMMON-LAYER.md) · [`Phase 4`](docs/PHASE-4-AUTH.md) · [`Phase 5`](docs/PHASE-5-ADMIN-DASHBOARD.md) · [`Phase 6`](docs/PHASE-6-PRODUCTS.md) · [`Phase 7`](docs/PHASE-7-CATEGORIES.md) · [`Phase 8`](docs/PHASE-8-INVENTORY.md) · [`Phase 9`](docs/PHASE-9-ORDERS.md) · [`Phase 10`](docs/PHASE-10-CUSTOMERS.md) · [`Phase 11`](docs/PHASE-11-PAYMENTS.md) · [`Phase 12`](docs/PHASE-12-SHIPPING.md) · [`Phase 13`](docs/PHASE-13-OFFERS.md) · [`Phase 14`](docs/PHASE-14-REVIEWS.md) · [`Phase 15`](docs/PHASE-15-REPORTS-SETTINGS.md) · [`Phase 16`](docs/PHASE-16-STOREFRONT-HOME-AUTH-CATALOGUE.md) · [`Phase 17`](docs/PHASE-17-CART-CHECKOUT.md).

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Zustand, Axios, React Hook Form + Zod, Lucide, Recharts |
| Backend | NestJS 12 (ESM), TypeScript, REST, class-validator, Swagger |
| Database | MongoDB + Mongoose 9 |
| Auth (planned) | JWT access tokens + rotating refresh tokens in HttpOnly cookies, RBAC |

## Repository layout

```
Ecommerce/
├── backend/            # NestJS API (ESM, Vitest, oxlint)
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   └── health/
│   └── package.json
├── frontend/           # Next.js App Router
│   └── src/
│       ├── app/        # route groups: (store) | (auth) | account | admin
│       ├── components/admin/{ui,layout,dashboard,auth}
│       ├── hooks/      # data-fetching hooks
│       ├── lib/api/    # Axios client, in-memory session, error mapping
│       ├── services/   # one module per API area
│       ├── store/      # Zustand stores (auth, ui)
│       └── types/      # API DTO mirrors
├── docs/
│   ├── ARCHITECTURE.md
│   ├── PHASE-1-INSPECTION.md
│   ├── PHASE-2-BOOTSTRAP.md
│   ├── PHASE-3-COMMON-LAYER.md
│   ├── PHASE-4-AUTH.md
│   ├── PHASE-5-ADMIN-DASHBOARD.md
│   ├── PHASE-6-PRODUCTS.md
│   ├── PHASE-7-CATEGORIES.md
│   ├── PHASE-8-INVENTORY.md
│   ├── PHASE-9-ORDERS.md
│   ├── PHASE-10-CUSTOMERS.md
│   └── PHASE-11-PAYMENTS.md
├── .gitignore
└── README.md
```

Backend module layout (`backend/src/modules/*`, `common/*`, `config/*`) and the storefront page groups (`(store)`, `(auth)`, `account`) are documented in the inspection report and are created phase by phase. The admin console (`/admin`) exists now; its sidebar lists every planned module and marks the ones that are not built yet.

## Prerequisites

- Node.js >= 22
- npm >= 10
- MongoDB (local instance or MongoDB Atlas)

## Setup

```bash
# backend
cd backend
npm install
cp .env.example .env      # then fill in MONGODB_URI (never commit .env)

# frontend
cd ../frontend
npm install
cp .env.example .env.local
```

Windows PowerShell equivalents:

```powershell
cd backend
npm install
Copy-Item .env.example .env
# edit .env, then:
cd ..\frontend
npm install
Copy-Item .env.example .env.local
```

> Use `;` or separate lines instead of `&&` in Windows PowerShell 5.1 — `&&` is a parse error there. The `npm run verify` / `npm run smoke` scripts below exist so you never need to chain commands.

### Backend environment variables

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development` \| `production` \| `test` |
| `PORT` | no | `5000` | Defaults to `5000` |
| `MONGODB_URI` | **yes** | `mongodb://127.0.0.1:27017/ecommerce` | Startup fails fast if missing |
| `JWT_ACCESS_SECRET` | **yes** | 48 random bytes | ≥ 32 chars, placeholders rejected. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `BCRYPT_ROUNDS` | no | `12` | Password hashing cost (4–15) |
| `FRONTEND_URL` | **yes** | `http://localhost:3000` | CORS allow-list, comma separated |
| `SWAGGER_ENABLED` | no | `true` | Defaults to enabled outside production |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | no | `15m` / `7d` | Consumed from Phase 4 |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | no | `60` / `100` | Requests per IP per route per window |

Environment variables are validated with Zod at startup (`src/config/env.validation.ts`); an invalid or missing value aborts boot with a readable message.

Frontend: `NEXT_PUBLIC_API_URL=http://localhost:5000/api`.

## Run

```bash
# API  → http://localhost:5000/api   (Swagger: /api/docs)
cd backend
npm run start:dev

# Web  → http://localhost:3000   (second terminal)
cd frontend
npm run dev
```

Health probes, cross-platform (no `curl` quirks):

```bash
cd backend
npm run smoke            # checks /health, /health/ready and /api/docs
```

Windows PowerShell 5.1 also aliases `curl` to `Invoke-WebRequest`; if you prefer curl there, call `curl.exe -i http://localhost:5000/api/health`.

## Endpoints (current)

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create account (public, 5/min) |
| `POST` | `/api/auth/login` | Sign in (public, 10/min) |
| `POST` | `/api/auth/refresh` | Rotate refresh cookie, new access token (public, 30/min) |
| `POST` | `/api/auth/logout` | Revoke session, clear cookie |
| `POST` | `/api/auth/logout-all` | Revoke every session (auth) |
| `GET` | `/api/auth/me` | Current user (auth) |
| `GET` | `/api/admin/dashboard/overview` | Admin dashboard analytics, `?range=today\|7d\|30d\|90d\|custom[&from&to]` (admin) |
| `GET`/`POST` | `/api/admin/offers` | List / create offers (admin) |
| `GET`/`PATCH`/`DELETE` | `/api/admin/offers/:id` | Detail / edit / archive an offer (admin) |
| `PATCH` | `/api/admin/offers/:id/status` | Pause or resume an offer (admin) |
| `GET` | `/api/admin/offers/:id/redemptions` | The redemption ledger for one offer (admin) |
| `GET` | `/api/admin/redemptions` | Store-wide ledger, `?status&search&from&to` (admin) |
| `GET` | `/api/admin/redemptions/export` | Ledger CSV (admin) |
| `POST` | `/api/coupons/validate` | Server-priced coupon preview (public, 20/min) |
| `GET` | `/api/offers/active` | Customer-visible live offers (public) |
| `GET` | `/api/products` | Published products: search, category, price band, stock, sale, rating, sort, paging (public) |
| `GET` | `/api/products/facets` | Filter values for the catalogue sidebar — category counts, price bounds, rating buckets (public) |
| `GET` | `/api/products/:idOrSlug/reviews` | Approved reviews for a product (public) |
| `GET` | `/api/products/:idOrSlug/reviews/summary` | Average rating, count and star distribution (public) |
| `GET` | `/api/products/:idOrSlug/reviews/eligibility` | Whether the signed-in customer may review it (auth) |
| `POST` | `/api/products/:idOrSlug/reviews` | Submit a review — verified buyers only (auth) |
| `GET` | `/api/reviews/mine` | The customer's own reviews and their status (auth) |
| `GET` | `/api/admin/reviews` | Moderation queue: search, status, product, rating, dates (admin) |
| `GET` | `/api/admin/reviews/summary` | Queue counts and approved average (admin) |
| `GET`/`PATCH`/`DELETE` | `/api/admin/reviews/:id` | Read / approve-reject / delete a review (admin) |
| `GET` | `/api/admin/settings` | Store settings, plus whether the currency is still editable (admin) |
| `PATCH` | `/api/admin/settings` | Update identity, contact, address, pricing inputs and COD (admin) |
| `GET` | `/api/store/settings` | Storefront-safe store profile: contact, address, currency, COD (public) |
| `GET` | `/api/admin/reports/sales` | Sales report: revenue, orders, averages, series, mix, categories, top products (admin) |
| `GET` | `/api/admin/reports/customers` | Customer report: new vs repeat, repeat rate, top buyers (admin) |
| `GET` | `/api/admin/reports/sales/export` | Sales report CSV (admin) |
| `GET` | `/api/admin/reports/customers/export` | Customer report CSV (admin) |
| `GET` | `/api` | Scaffold smoke test (`"Hello World!"`), removed when real modules land |
| `GET` | `/api/health` | Liveness — always `200`, touches no dependency |
| `GET` | `/api/health/ready` | Readiness — `200` when MongoDB is connected, `503` otherwise |
| `GET` | `/api/docs` | Swagger UI (disabled in production unless `SWAGGER_ENABLED=true`) |

## API conventions

Success:

```json
{ "success": true, "data": { "…": "…" } }
```

Lists add pagination metadata:

```json
{ "success": true, "data": [], "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0, "hasNextPage": false, "hasPreviousPage": false } }
```

Errors:

```json
{ "success": false, "statusCode": 400, "error": "Bad Request", "message": "Validation failed", "details": ["limit must not be greater than 100"], "path": "/api/products", "method": "GET", "timestamp": "…", "requestId": "…" }
```

Auth: the access token is returned in the body and must be kept **in memory**; the refresh token is only ever an `HttpOnly` cookie (`Path=/api/auth`, `SameSite=Lax`). The frontend does exactly that — see [`docs/PHASE-4-AUTH.md`](docs/PHASE-4-AUTH.md) and [`docs/PHASE-5-ADMIN-DASHBOARD.md`](docs/PHASE-5-ADMIN-DASHBOARD.md).

Money is transported as integer minor units (paise) everywhere; the UI is the only place that divides by 100.

Health probes are intentionally flat, unthrottled and outside the envelope. Every response carries `X-Request-Id`, and helmet security headers (CSP, `nosniff`, `SAMEORIGIN`, `no-referrer`) are applied to all non-Swagger routes. Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Scripts

Backend: `verify` (typecheck + lint + unit + e2e + build), `smoke` (HTTP probes against a running API), `build`, `start:dev`, `start:prod`, `typecheck`, `lint` (oxlint), `format` (prettier), `test` (Vitest), `test:e2e`, `test:cov`.
Frontend: `dev`, `build`, `start`, `typecheck` (`next typegen && tsc`), `lint` (`eslint`, includes the React Compiler hooks rules).

E2E tests do not require a database: the Mongoose connection is substituted, so `npm run test:e2e` is CI-safe.

## Admin console

`http://localhost:3000/admin` → guarded console. Sign in with an administrator account; a customer account is rejected and its session is revoked. The access token is held in memory only, and a page reload restores the session through the HttpOnly refresh cookie.

The dashboard (`/admin/dashboard`) is entirely API-driven — six metric cards, revenue/orders trends, status distribution, category sales, recent orders, top products, low-stock alerts, new customers and an activity feed composed from those records — with today / 7 / 30 / 90 day and custom date filters.

**Products** (`/admin/products`) is a real, API-driven catalogue: server-side paginated listing with search (name/SKU/slug), category/status/stock filters and sortable columns, a create/edit form (basic info, pricing, images, inventory, status, SEO), multi-image upload with primary/reorder, publish & unpublish, a details view, and delete-with-confirmation that archives instead of deleting when orders reference the product. See the [Phase 6 report](docs/PHASE-6-PRODUCTS.md).

**Categories** (`/admin/categories`) manages the hierarchy products hang off: server-paginated listing with search, status and parent filters, create/edit with image + SEO + display order, parent/subcategory nesting (max three levels, cycles rejected), product counts, activate/deactivate, and delete guarded by children and products. See the [Phase 7 report](docs/PHASE-7-CATEGORIES.md).

**Inventory** (`/admin/inventory`) owns every stock change. Summary cards (products, units, low/out counts, value at cost), a server-paginated table with name/SKU search, category and stock-status filters, sorting, and CSV export; a stock-adjustment modal that previews the resulting quantity and requires confirmation; and an append-only stock history (previous → new, reason, reference, admin). Stock is atomic and audited server-side, can never go negative, and `PATCH /api/admin/products/:id` refuses `stock` outright. See the [Phase 8 report](docs/PHASE-8-INVENTORY.md).

**Orders** (`/admin/orders`) is the money-and-stock system of record. Server-paginated listing with search (order number, customer name or email), status/payment-method/date filters, sorting and CSV export; a detail page with items (purchase-time snapshots), customer, address, shipping and tracking, payment and refunds, pricing summary and an append-only timeline; a status machine that only offers legal transitions; cancellation with exactly-once stock restoration and a queued refund (never an assumed one); a return workflow that restocks only after an inspection approves it; and a printable invoice built purely from snapshots. Totals, discounts, shipping and tax are computed by the API — never trusted from the browser. See the [Phase 9 report](docs/PHASE-9-ORDERS.md).

**Customers** (`/admin/customers`) is built on the existing `users` collection — no second customer table. Six real analytics cards (total, new this month, active, repeat buyers, average spend, net revenue), server-paginated listing with name/email/phone search, status and registration-date filters, spending range, "has purchased", sorting by date/spending/name and CSV export; a profile page with spending summary, paginated order history, addresses captured from order snapshots, activity feed and audit history; and an audited account-state machine (active / suspended / deactivated) that revokes sessions, blocks ordering immediately and never touches order or payment history. Spending counts paid orders only and is net of processed refunds, using the same definition as the dashboard. See the [Phase 10 report](docs/PHASE-10-CUSTOMERS.md).

**Payments** (`/admin/payments`) treats a gateway transaction as its own record — an order can be attempted many times, and an attempt needs gateway ids, an event log and a retry-safe state, none of which belong on the order. Five summary cards (total, successful, pending, failed, refunded amount), a server-paginated transaction table with transaction/order/customer search, status and method filters, date range, sorting and per-row refunds; a detail page with the order, customer, gateway references (`order_…`/`pay_…`/`rfnd_…`), refund history and an append-only timeline. Razorpay is integrated over its REST API with HMAC verification: the browser only receives the publishable key, a capture is applied to the order only after the signature and a fresh gateway read, webhooks are verified over the raw body and de-duplicated by event id, and refunds always go through the gateway. There is no endpoint that lets anyone mark an order paid — online methods are refused on the manual-payment route. See the [Phase 11 report](docs/PHASE-11-PAYMENTS.md).

**Shipping** (`/admin/shipping`) tracks the parcel as its own record, separate from the order's fulfilment and from the money. Seven cards (total, ready to ship, shipped, in transit, out for delivery, delivered, delayed/failed), a server-paginated table with shipment/order/customer/tracking search, status, courier, date-range and delayed filters, sortable columns and a create dialog restricted to confirmed/processing orders that are paid or cash-on-delivery. A shipment moves through `pending → ready_to_ship → shipped → in_transit → out_for_delivery → delivered`, with a `delivery_failed` branch that can be re-attempted or end in `returned_to_sender`; only legal transitions are accepted, a failure needs a reason, `delivered`/`returned_to_sender` are terminal, and every change appends an audited event. A parcel's movement advances the order through the order's own legal transitions — opening a page never delivers anything, and payment status is never touched. Creation copies the address from the checkout snapshot and the database enforces one live shipment per order. Courier partners (Shiprocket, Delhivery, Blue Dart) are declared in a registry that enables one only when its credentials exist; with none configured the store runs the manual workflow and invents no tracking data. Customers see a customer-safe timeline at `/account/orders/[id]/tracking`. See the [Phase 12 report](docs/PHASE-12-SHIPPING.md).

**Offers & coupons** (`/admin/offers`) runs percentage, fixed-amount and free-shipping coupons. Six cards (total, active, scheduled, expired, redemptions, discount given), a server-paginated table with code/name search, status, discount-type and date filters, sortable columns, and pause/resume/archive actions. The editor carries the whole configuration — code, value, minimum spend, percentage cap, start/expiry, total and per-customer limits, applicable and excluded products/categories, visibility — and every change is written to an audit trail. Discounts are priced once, server-side: `POST /api/coupons/validate` re-prices the cart from the catalogue and returns the breakdown, and `POST /api/orders` re-quotes and reserves the use inside the same request, so a client can never supply an amount. A use is reserved at checkout, finalised when the order is confirmed, and reversed when it is cancelled or returned; the counters are claimed with guarded atomic increments and the ledger has a unique `(offer, order)` key, so retries and simultaneous checkouts cannot double-spend a code. Orders keep the discount they were created with, forever. Customers browse live codes at `/offers`, and the reusable `<CouponField>` renders the server-computed totals inside the storefront. See the [Phase 13 report](docs/PHASE-13-OFFERS.md).

**Reviews & ratings** (`/admin/reviews`) is a moderation queue, not an open comment box. Only a customer whose order containing the product reached `delivered` may review it, and nothing reaches the storefront until an admin publishes it: five cards (total, awaiting moderation, published, rejected, average rating), search across customer/order/text, status, star and date filters, and approve / reject-with-reason / delete actions. Approving publishes the review with a masked author (`Asha R.`); a rejection requires a reason and stays visible only in the console. One review per customer per product is enforced by a unique index, and a repeated decision is a `409` rather than a silent rewrite. The product page shows the API-computed average, the 5→1 distribution and the latest approved reviews, plus a review form whose state comes from an eligibility check — though the submit endpoint re-verifies the delivered order regardless of what the UI claims. See the [Phase 14 report](docs/PHASE-14-REVIEWS.md).

**Settings** (`/admin/settings`) is the store's single configuration document: name and legal entity, support email and phone, invoice/returns address, invoice footer, post-checkout note, currency, locale, tax rate, flat shipping fee, free-shipping threshold and the cash-on-delivery switch. It is authoritative — `ORDER_*` environment values only seed a fresh store, and orders and coupons read `SettingsService.pricing()` at the start of anything that prices money, so a save applies to the next order without a redeploy. Placed orders keep their own snapshot of rate, fee and currency, so no history is rewritten. Currency is effectively write-once: prices are stored as minor units of one currency, so a change is refused with `409` once any product or order exists and the console disables the field with the reason. `codEnabled: false` is enforced in checkout, not just hidden in the browser. See the [Phase 15 report](docs/PHASE-15-REPORTS-SETTINGS.md).

**Reports** (`/admin/reports`) covers sales and customers over one date range (`today`/`7d`/`30d`/`90d`/custom). Sales reuses the dashboard's own aggregations — revenue, orders, average order value, revenue and order series, status mix, sales by category, top products — so a figure can never disagree with the dashboard. Customers answers what the dashboard could not: new customers (first *ever* order inside the window), repeat customers, active customers, repeat rate, orders per customer and the top buyers, keyed by `userId` when signed in and by lower-cased email for guests. Both export as CSV attachments with the range in the header and quoted cells. See the [Phase 15 report](docs/PHASE-15-REPORTS-SETTINGS.md).

**Storefront** renders from the public API only: inactive categories and unpublished products are never served, so the UI cannot show something the API would not sell. The home page (`/`) is a marketplace landing page — hero with a working search form, category tiles, deals (sale prices below list), top-rated, new arrivals and featured rails, plus a payment/support band read from the store settings document (so it stops promising cash-on-delivery the moment an admin turns it off). `/products` is the browse page: category counts, price bands and custom min/max, 4★/3★ rating buckets, in-stock and on-sale filters, five sort orders, per-filter chips, and link-based pagination — all of it in the URL and rendered on the server, so a filtered list is shareable and the back button works. Product cards show the discount percentage, the effective price against the struck-through list price, and a `4.6 ★ (12)` rating pill backed by approved reviews (the product's cached rating is written by the review moderation path, and a test asserts it equals the review summary). Shoppers can sign in or register at `/login` / `/register` (zod rules mirroring the API), see their profile at `/account`, and their own orders at `/account/orders` — the token lives in memory only and a reload recovers from the HttpOnly refresh cookie. See the [Phase 16 report](docs/PHASE-16-STOREFRONT-HOME-AUTH-CATALOGUE.md).

**Cart & checkout** (`/cart`, `/checkout`) is where shopping actually happens. The cart lives on the server, one document per customer, and stores product ids, quantities and the coupon *code* — never a price: every read re-prices the basket from the live catalogue and from `SettingsService.pricing()`, returning one breakdown (sale savings, coupon, tax, shipping, total) in integer paise. Unavailable products stay visible and flagged instead of vanishing, and the coupon is re-priced on every read, so an expired code is removed with an explanation rather than failing at the last step. `/checkout` is three collapsible steps — address, payment, review — over `POST /api/checkout/preview`, a genuine dry run that reserves nothing. Placing the order re-validates stock, the coupon and the COD policy server-side, creates the order (with reservation, coupon redemption and idempotency handled by the orders module), clears the cart only for a genuinely new order, and either confirms a COD order immediately or hands back a gateway order for Razorpay. The widget's success callback is never trusted: `/api/checkout/verify-payment` verifies the signature, re-reads the payment from the gateway and only then confirms the order, with a forged signature answered `422`. Customers land on `/checkout/success`, which re-reads the order so a reload works. Cash on delivery can be switched off or capped at an amount in settings, and both are enforced on the server. The header carries a live cart badge, and product pages have a real "Add to cart" button. See the [Phase 17 report](docs/PHASE-17-CART-CHECKOUT.md).

Sidebar entries for modules that do not exist yet (notifications) are shown as `Soon` and are not clickable, so nothing leads to a 404. The API gap list is in the [Phase 5 report](docs/PHASE-5-ADMIN-DASHBOARD.md#5-wired-vs-missing).

## Seeding the store owner

```powershell
# add SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD to backend/.env first
cd backend
npm run seed:admin        # idempotent: creates or updates the admin account
npm run seed:categories   # starter categories so products can be created (Phase 6)
```

## Database

MongoDB (local or Atlas). The API fails fast when the database is unreachable — 3 bounded retries, then exit code `1` — and `autoIndex` is disabled in production. Atlas setup details (IP allow-list, least-privilege user, URI encoding) are in the Phase 2 report.

## Security notes

- `.env` files are gitignored at both root and package level; only `.env.example` is committed.
- Never commit credentials, API keys, or tokens. Payment and upload integrations (Razorpay, Cloudinary) will read secrets from the environment only.
- The browser never persists an access token: it lives in a module variable, and refresh tokens stay in `HttpOnly` cookies. No `localStorage`/`sessionStorage` is used anywhere in the frontend.
- Admin authorization is enforced by NestJS guards on every endpoint; the client-side route guard only decides what to render, never what may be read.

## Roadmap

Phases 1–16: inspection → bootstrap → common layer → **auth/RBAC** → **admin console (dashboard)** → users → catalog → cart/wishlist → **inventory** → **orders** → **customers** → payments → coupons → reviews → reports/settings → **storefront home, accounts & browsing** → cart/checkout UI → notifications → performance → testing & deployment. Admin work is delivered in approved slices; catalog, orders and payments keep their original scope. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#10-phases) for the current state.
