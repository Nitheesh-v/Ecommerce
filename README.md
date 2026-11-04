# Ecommerce — Single-Vendor E-Commerce Platform

Production-oriented, single-vendor e-commerce platform. Monorepo with a Next.js (App Router) storefront/admin and a NestJS REST API backed by MongoDB.

> **Status: Phase 9 (order management) complete.** Authentication with rotating refresh tokens, a guarded `/admin` console, the catalogue, categories, inventory and now the full order lifecycle — checkout, status machine, shipping/tracking, cancellations with exactly-once stock restoration, returns, refunds and invoices — are implemented and verified. Next: customer management (not started).
> Docs: [`Architecture`](docs/ARCHITECTURE.md) · [`Phase 1`](docs/PHASE-1-INSPECTION.md) · [`Phase 2`](docs/PHASE-2-BOOTSTRAP.md) · [`Phase 3`](docs/PHASE-3-COMMON-LAYER.md) · [`Phase 4`](docs/PHASE-4-AUTH.md) · [`Phase 5`](docs/PHASE-5-ADMIN-DASHBOARD.md) · [`Phase 6`](docs/PHASE-6-PRODUCTS.md) · [`Phase 7`](docs/PHASE-7-CATEGORIES.md) · [`Phase 8`](docs/PHASE-8-INVENTORY.md) · [`Phase 9`](docs/PHASE-9-ORDERS.md).

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
│   └── PHASE-9-ORDERS.md
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

The storefront (`/`) now renders from the public API: a landing page with active categories and featured products, `/categories`, `/categories/[slug]` (breadcrumbs, subcategories, paginated product grid) and `/products/[slug]`. Inactive categories and unpublished products are never served by the public API.

Sidebar entries for modules that do not exist yet (payments, coupons, customers, reviews, reports, notifications, settings) are shown as `Soon` and are not clickable, so nothing leads to a 404. The API gap list is in the [Phase 5 report](docs/PHASE-5-ADMIN-DASHBOARD.md#5-wired-vs-missing).

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

Phases 1–14: inspection → bootstrap → common layer → **auth/RBAC** → **admin console (dashboard)** → users → catalog → cart/wishlist → **inventory** → **orders** → payments → coupons/reviews/notifications → performance → testing & deployment. Admin work is delivered in approved slices; catalog, orders and payments keep their original scope. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#10-phases) for the current state.
