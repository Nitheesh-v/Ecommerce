# Architecture

Single-vendor e-commerce platform: **Next.js 16 (App Router)** storefront + admin, **NestJS 12 (ESM)** REST API, **MongoDB + Mongoose 9**.

This document is the contract for how code is organised. Read it before adding a module.

---

## 1. Principles

1. **Backend is the source of truth.** Prices, totals, discounts, stock and permissions are decided server-side. The frontend never sends a price it expects to be trusted.
2. **One shape per concern.** Every success uses the same envelope, every failure uses the same error body. Clients write one parser, not twenty.
3. **Deny by default.** Routes are authenticated unless marked `@Public()`; input is rejected unless it matches a DTO; unknown properties are errors.
4. **Thin controllers, fat services.** Controllers translate HTTP ↔ service calls. Business rules live in services, persistence in repositories/schemas.
5. **Testable without infrastructure.** The database is substitutable; global behaviour is exercised through the real `AppModule`.

---

## 2. Repository layout

```
Ecommerce/
├── backend/
│   ├── src/
│   │   ├── main.ts                 # bootstrap: create app, configureApp, listen
│   │   ├── app.setup.ts            # prefix, cookies, helmet, CORS, Swagger
│   │   ├── app.module.ts           # global providers (pipe/guard/filter/interceptors)
│   │   ├── config/                 # env schema + validation (Zod)
│   │   ├── common/                 # cross-cutting, framework glue, no business logic
│   │   │   ├── constants/          # metadata keys
│   │   │   ├── decorators/         # @Public, @Roles, @CurrentUser, @SkipResponseEnvelope
│   │   │   ├── dto/                # envelope DTOs, PaginationQueryDto
│   │   │   ├── enums/              # Role
│   │   │   ├── exceptions/         # PassthroughHttpException
│   │   │   ├── filters/            # AllExceptionsFilter
│   │   │   ├── interceptors/       # ResponseInterceptor, LoggingInterceptor
│   │   │   ├── interfaces/         # AuthenticatedUser, RequestWithContext
│   │   │   ├── middleware/         # RequestIdMiddleware
│   │   │   └── utils/              # pagination helpers
│   │   ├── database/               # base schema options shared by every collection
│   │   ├── health/                 # liveness + readiness
│   │   └── modules/                # feature modules
│   │       ├── users/              # user schema, repository, hashing, public mapping
│   │       ├── auth/               # tokens, sessions, guards, auth flows
│   │       ├── products/           # catalogue + admin CRUD + image storage
│   │       ├── categories/         # hierarchy, SEO, storefront reads
│   │       ├── inventory/          # the only stock writer + audit trail + alerts
│   │       ├── orders/             # order lifecycle, returns, refunds, invoices
│   │       ├── customers/          # admin read model over users ⨝ orders
│   │       ├── payments/           # gateway attempts, webhooks, refunds, admin console
│   │       ├── shipments/          # parcels, delivery state machine, courier registry
│   │       └── admin/              # dashboard aggregation
│   └── test/                       # e2e specs + test support modules
├── frontend/
│   └── src/
│       ├── app/                    # (store) | (auth) | account | admin route groups
│       ├── components/             # ui (shadcn), layout, shared
│       ├── features/               # per-domain components + hooks
│       ├── services/               # Axios clients, one file per resource
│       ├── store/                  # Zustand stores
│       ├── lib/ hooks/ types/ utils/
└── docs/
```

Each feature owns one directory under `modules/`; modules never reach into each other's
repositories — they call services (e.g. orders → `InventoryService`, never `inventory_movements`).

---

## 3. Request lifecycle

```
HTTP request
  │
  ├─ RequestIdMiddleware        assigns/echoes x-request-id
  ├─ cookieParser               (refresh-token cookie, Phase 4)
  ├─ helmet                     security headers (Swagger UI exempt)
  ├─ CORS                       FRONTEND_URL allow-list, credentials
  │
  ├─ ThrottlerGuard             rate limit per IP per route (health exempt)
  ├─ JwtAuthGuard               deny by default; @Public() opts out
  ├─ RolesGuard                 @Roles(Role.Admin) etc.
  │
  ├─ ValidationPipe             DTO validation + whitelist + transform
  ├─ Controller → Service       business logic
  │
  ├─ LoggingInterceptor         one structured log line per request
  ├─ ResponseInterceptor        wraps result in { success, data, meta? }
  │
  └─ AllExceptionsFilter        converts any thrown error into ApiErrorBody
```

Ordering matters: logging is the outermost interceptor so it measures the whole request; the filter runs after routing fails as well as after handlers throw.

Global providers are registered in `app.module.ts` via `APP_PIPE`, `APP_GUARD`, `APP_INTERCEPTOR`, `APP_FILTER`. Anything that must touch the raw application (`setGlobalPrefix`, CORS, helmet, Swagger, cookie parser) lives in `app.setup.ts`, which **both** `main.ts` and the e2e tests call — tested behaviour equals shipped behaviour.

---

## 4. API contracts

### Success

```json
{ "success": true, "data": { "id": "65f...", "name": "Shoes" } }
```

### Success with pagination

```json
{
  "success": true,
  "data": [ { "id": "…" } ],
  "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7, "hasNextPage": true, "hasPreviousPage": false }
}
```

Produce it with `createPaginatedResult(items, page, limit, total)`; the interceptor promotes `meta` to the top level.

### Error

```json
{
  "success": false,
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": ["limit must not be greater than 100"],
  "path": "/api/products?limit=1000",
  "method": "GET",
  "timestamp": "2026-11-03T10:55:00.000Z",
  "requestId": "9c1f…"
}
```

| Source | Status | Notes |
| --- | --- | --- |
| `class-validator` failure | `400` | `message: "Validation failed"`, details are per-field |
| `NotFoundException` etc. | as thrown | message preserved |
| Mongo duplicate key (`11000`) | `409` | details name the unique field |
| Mongo `CastError` | `400` | invalid ObjectId |
| Anything unexpected | `500` | `"Internal server error"` in production; stack only in logs |

`PassthroughHttpException` bypasses the envelope — reserved for infrastructure (readiness probe).

### Infrastructure

`GET /api/health` and `GET /api/health/ready` return flat bodies and skip both the envelope and rate limiting.

### Authentication endpoints

| Method | Path | Access | Result |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | public, 5/min | 201 + access token + refresh cookie |
| `POST` | `/api/auth/login` | public, 10/min | 200 + access token + refresh cookie |
| `POST` | `/api/auth/refresh` | public (cookie), 30/min | 200 + rotated cookie |
| `POST` | `/api/auth/logout` | public (cookie) | 204, session revoked, cookie cleared |
| `POST` | `/api/auth/logout-all` | authenticated | 200, every session revoked |
| `GET` | `/api/auth/me` | authenticated | 200, current user |

The refresh token never appears in a response body — only in the `refresh_token` HttpOnly cookie (`Path=/api/auth`, `SameSite=Lax`, `Secure` in production). Access tokens are returned in the body and must be kept in memory by the client.

---

## 5. Security posture

| Concern | Implementation |
| --- | --- |
| Headers | `helmet` — CSP `default-src 'self'`, `X-Frame-Options: SAMEORIGIN`, `nosniff`, `no-referrer`; Swagger UI exempt |
| CORS | explicit allow-list from `FRONTEND_URL` (comma separated), `credentials: true`, `x-request-id` exposed |
| Rate limiting | `@nestjs/throttler`, global default `THROTTLE_LIMIT` per `THROTTLE_TTL` seconds; health exempt; stricter per-route limits from Phase 4 |
| Input | global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` + `transform` |
| Errors | no stack traces or driver messages in responses; correlation id instead |
| Config | Zod-validated environment, fail-fast at boot; `.env` gitignored, `.env.example` committed |
| Secrets | never in the frontend bundle, never in the database; only `NEXT_PUBLIC_*` reaches the browser |

Authentication (Phase 4, see `docs/PHASE-4-AUTH.md`):

| Concern | Implementation |
| --- | --- |
| Passwords | bcrypt, cost `BCRYPT_ROUNDS` (12), 8–72 chars, timing-safe unknown-email path |
| Access token | HS256 JWT, 15 m, issuer/audience checked, kept in memory by the client |
| Refresh token | opaque 48-byte token in `HttpOnly` cookie, **only its SHA-256 hash stored**, rotated on every use |
| Theft response | replaying a rotated token revokes every session of that user |
| Revocation | `logout` (one session), `logout-all` (all), TTL index cleans expired sessions |
| Authorization | deny-by-default `JwtAuthGuard` + `RolesGuard`, `@Public()` / `@Roles()` / `@CurrentUser()` |

Admin API (Phase 5, see `docs/PHASE-5-ADMIN-DASHBOARD.md`):

| Concern | Implementation |
| --- | --- |
| Guarding | class-level `@Roles(Role.Admin)` on the admin controller; every admin endpoint re-checks the role server-side |
| Analytics | `GET /api/admin/dashboard/overview` — one request, eight parallel aggregation reads, gap-filled daily series |
| Money | integer minor units everywhere; only the UI divides by 100 |
| Read models | `DashboardRepository` is an abstract class (DI token) with an in-memory fake for tests; the Mongoose implementation documents the collection contract that product/order modules must satisfy |
| Empty store | missing collections aggregate to zeros; the UI renders explicit empty states rather than implying zero demand |

Products (Phase 6, see `docs/PHASE-6-PRODUCTS.md`):

| Concern | Implementation |
| --- | --- |
| Namespace | storefront reads are public and read-only (`/api/products`); every write lives under `/api/admin/products` behind `@Roles(Role.Admin)` |
| Money | integer minor units (paise) in DTOs, schema and UI state; `salePrice < price` is re-checked against the *stored* price on partial updates |
| Uniqueness | unique `sku` (case-insensitive) and `slug` indexes; generated slugs get numeric suffixes, explicit duplicates return `409` |
| Visibility | only `status: 'published'` is readable by customers; `costPrice` is stripped from every public projection |
| Deletion | `countOrderReferences()` reads `orders.items.productId`; referenced products are archived instead of deleted so order history survives |
| Images | bytes never enter MongoDB — only `{ url, publicId, alt, isPrimary }`; local disk by default, Cloudinary when all three `CLOUDINARY_*` vars are set |

Categories (Phase 7, see `docs/PHASE-7-CATEGORIES.md`):

| Concern | Implementation |
| --- | --- |
| Hierarchy | `parentId` (`null` = top level), max three levels, enforced in the service; ancestors are walked with a visited set so a cycle is rejected and a corrupt tree still terminates |
| Uniqueness | slug unique per catalogue; names unique **per parent** (case-insensitive), so two departments may both have a "Tops" category |
| Deletion | refused with `409` while the category has children or products — nothing is cascaded, so product references can never dangle |
| Public surface | `GET /api/categories` returns only active categories, nested; inactive categories (and children of inactive parents) are 404s |
| Product counts | aggregated from the `products` collection per page, not per row; the in-memory fake uses a provider so tests stay consistent |
| Storefront | server-rendered `fetch` reads marked `'use cache'` with `cacheLife('minutes')`; unpublished products and inactive categories are filtered by the API, never by the UI |

Inventory (Phase 8, see `docs/PHASE-8-INVENTORY.md`):

| Concern | Implementation |
| --- | --- |
| Source of truth | `products.stock` — no second quantity. `inventory_movements` records *history*, not a parallel balance |
| Writes | only `InventoryService`: atomic `findOneAndUpdate` (`$inc` / `$set`), with `stock: { $gte: n }` in the filter so a decrement can never oversell |
| Audit | append-only movement per change (snapshot name/SKU, previous/new, reason, actor, reference); no update/delete route exists |
| Idempotency | partial unique index on `(referenceId, type)` + a compensation write when a lost race is detected — replays never double-move stock |
| Product edits | `stock` removed from the update DTO (400 if sent); opening stock on create is logged as `initial` |
| Alerts | `inventory_alerts`, one open row per product+level; escalation and dedupe handled in the service, notifications behind `InventoryNotifier` |
| Order integration | `reserveForOrder` at checkout, `restockForOrder` on cancellation and after an approved return inspection — see Phase 9 |

Orders (Phase 9, see `docs/PHASE-9-ORDERS.md`):

| Concern | Implementation |
| --- | --- |
| Money | every total is computed server-side from the product records at creation time (integer paise); client-sent prices are a `400`, never a discount |
| Snapshots | items (`name`, `sku`, `imageUrl`, `unitPrice`, `listPrice`, `discount`, `lineTotal`) and the shipping address are frozen on the order; invoices never re-read the catalogue |
| State machine | `order-status.ts` is the only authority: linear fulfilment, cancellation only before shipment, returns only after delivery; illegal jumps `409`, no-ops `400` |
| Concurrency | each transition is a guarded `findOneAndUpdate` on the previous status plus its history entry, so a stale tab cannot double-apply |
| Stock | `reserveForOrder` / `restockForOrder` with stable `order:<no>:<scope>:<productId>` reference ids; `cancellation.restocked` is a second exactly-once guard |
| Payments | an admin records a *verified* payment; the storefront can never mark an order paid. Refunds are capped obligations that must be settled explicitly |
| Returns | `requested → approved → received → inspected → restocked → returned`; inspection decides restocking, completion queues the refund |
| Audit | append-only `history[]` (`kind`, `from`, `to`, `reason`, `note`, `by`, `at`) written in the same atomic update as the change |
| Isolation | customer routes derive `userId` from the token; another customer's order is a `404`, never a `403` existence leak |

Customers (Phase 10, see `docs/PHASE-10-CUSTOMERS.md`):

| Concern | Implementation |
| --- | --- |
| Identity | a customer **is** a `users` document (`role: 'customer'`) — no second collection, no duplicated credentials |
| Account state | `status` (`active \| suspended \| deactivated`) with `isActive` kept as a derived mirror so existing auth checks keep working; append-only `statusHistory[]` records from/to, reason, admin and time |
| Writes | only `UsersRepository.updateStatus`, guarded on the status that was read — two admins produce one change and one `409` |
| Enforcement | login/refresh already reject inactive accounts; `ActiveAccountGuard` (opt-in) blocks suspended tokens on customer order routes, and suspend/deactivate revokes every refresh session |
| Read model | one aggregation: `users` → `$lookup orders` → derived metrics → filter by spending → sort → `$facet` (page + count). Filtering/sorting by spending is therefore correct across pages |
| Spending | shared with the dashboard via `orders/spending.ts`: counted = money collected and not cancelled/returned; net = `paidAmount − processedRefunds`; pending refunds reported, never subtracted |
| Addresses | derived from order snapshots (newest first) — nothing is collected twice |
| Export | `GET /api/admin/customers/export` → `text/csv` attachment, same filters as the table, 5 000-row ceiling, allow-listed columns only |

Payments (Phase 11, see `docs/PHASE-11-PAYMENTS.md`):

| Concern | Implementation |
| --- | --- |
| Records | `payments` = one row per gateway **attempt** (`order_…`, `pay_…`, status, timestamps, refund mirrors); `payment_events` = append-only audit + webhook idempotency (`eventId` unique). The order keeps owning money (`paidAmount`, `refunds[]`) |
| Amounts | always re-read from the order; the checkout DTO rejects a client-sent amount (`forbidNonWhitelisted` → `400`) |
| Capture | signature (`HMAC-SHA256("order\|payment", key_secret)`) **then** a fresh `GET /payments/:id`; only then the payment flips to `captured` and `OrdersService.confirmGatewayPayment()` writes the order under a `paymentStatus` guard |
| Idempotency | guarded status transitions, unique gateway ids, replay detection on the order, and webhook claims keyed on `eventId` (a duplicate is `200 { duplicate: true }`, a failed apply releases the claim so the retry can work) |
| Webhooks | `POST /api/payments/webhook` is public but HMAC-verified over the **raw** body (`rawBody: true`), `@SkipThrottle()` because retries must not be rate-limited; handles authorized / captured / failed / refund.processed / refund.failed |
| Statuses | `pending → authorized → captured → partially_refunded → refunded`, plus terminal `failed`/`cancelled`; no transition moves *into* a paid state from a failure, and cancellation only queues a refund |
| Refunds | obligation recorded on the order first (audited), executed on the gateway, finalised with the gateway's `rfnd_…`; one pending refund at a time; the sum can never exceed `paidAmount` |
| Mirror | `OrdersService` publishes refund changes on `OrderEvents`; `PaymentsService` subscribes and updates `refundedAmount` / `status`. One-way, so no module cycle |
| Secrets | `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` are read only by the payments module, never returned, never logged; the browser gets `RAZORPAY_KEY_ID` only |
| No gateway | without credentials a `DisabledPaymentGateway` answers `503` while every admin view keeps working |

Shipping (Phase 12, see `docs/PHASE-12-SHIPPING.md`):

| Concern | Implementation |
| --- | --- |
| Records | `shipments` = one document per parcel (number, order refs, address snapshot, courier, cost, weight/dimensions, dates, append-only `events`). The order keeps a denormalised mirror in `order.shipping` |
| One live parcel | partial unique index `{ orderId: 1 }` where `status != 'returned_to_sender'`; a duplicate insert returns `null` → `409`. A replacement is allowed only after a return to sender |
| Eligibility | order `confirmed`/`processing` (plus `shipped`/`out_for_delivery` **only** for a replacement) and paid **or** COD/manual shipping; payment status is read, never written |
| Address | copied server-side from `order.shippingAddress`; required fields + phone pattern re-validated; a client-sent address is rejected by the whitelist |
| Statuses | `pending → ready_to_ship → shipped → in_transit → out_for_delivery → delivered` plus `delivery_failed` (re-attemptable, also → `returned_to_sender`); `delivered`/`returned_to_sender` terminal |
| Guards | transitions validated in the service **and** applied with a `findOneAndUpdate` status guard → one transition per concurrent click; reason mandatory for failures/returns; `shipped` requires courier + AWB |
| Order coupling | `OrdersService.promoteFulfilment()` walks `FULFILMENT_FLOW` one legal step at a time (`shipped`, `out_for_delivery`, `delivered`) and refuses cancelled/returned/return-requested orders. Mirrors never change a status |
| History | every change writes an event (`created`/`status`/`courier`/`note`, `source`, `by`, `at`) in the same atomic update; read-only in the console |
| Courier layer | `CourierRegistry` declares manual + Shiprocket + Delhivery + Blue Dart; a provider is enabled only when all its env vars exist, otherwise selecting it is a `503` naming the variables. No credentials → manual workflow, no invented tracking data, **no webhook endpoint** |
| Customer view | `GET /api/orders/:id/tracking` is owner-scoped (`404` for a foreign order) and projects statuses/times only — no cost, notes, address or staff identity |
| Delayed | derived (`estimatedDelivery < now` and still in flight), never stored |

Coupons & discounts (Phase 13, see `docs/PHASE-13-OFFERS.md`):

| Concern | Implementation |
| --- | --- |
| Records | `offers` (definition + audit `history`), `coupon_redemptions` (one row per use, driven by the order), `coupon_customer_usage` (counters keyed `offerId:customerKey`) |
| Status | derived from `isActive` + window + counters (`active`/`scheduled`/`expired`/`exhausted`/`inactive`); stored nowhere, mirrored in Mongo filters so badges and queries agree |
| Pricing | `evaluateOffer()` decides the discount on the **eligible** lines (include/exclude rules, minimum spend); `computeTotals()` stays the only place totals are made, gaining a `freeShipping` option |
| No client money | `POST /api/coupons/validate` takes `{ code, items:[{productId, quantity}] }`, re-prices from the catalogue and returns the breakdown; a client-posted amount is rejected by the DTO whitelist |
| Limits | `reserveUsage()` is one guarded `findOneAndUpdate` (active + window + total + per-customer), so two checkouts cannot share the last use |
| Idempotency | unique `(offerId, orderId)` on redemptions; `confirm` only moves `reserved → redeemed`; `reverse` only closes a live row and returns its previous status |
| Lifecycle | reserve inside `POST /api/orders` → `attach(orderId)` → `confirmed` finalises, `cancelled`/`returned` reverse; every transition is published from `OrdersService.applyOrConflict()`, shipment promotions included |
| History | the order stores `couponCode`/`couponDiscount` once; editing an offer never recalculates an existing order |
| Modules | `CouponsModule` binds the two repositories and exposes `CouponPricingService`; orders inject that port and listen to `OrderEventsModule` — never import `OrdersModule` into coupons (cycle) |

Frontend auth & API layer (Phase 5):

| Concern | Implementation |
| --- | --- |
| Access token | module-scoped memory only (`lib/api/session.ts`); no storage APIs, no readable cookies |
| Refresh | single-flight `POST /auth/refresh` from an Axios response interceptor, replay-once on 401, hard sign-out when it fails |
| Layering | `store → service → client → session` (never back into the store) to keep imports acyclic |
| Route guard | `AdminShell` renders/redirects but never authorizes: the API stays the single authority |

---

## 6. Database conventions

- Every schema spreads `baseSchemaOptions` from `src/database/base.schema.ts`: `timestamps`, no `__v`, `toJSON` mapping `_id → id`.
- Types are declared with `import type { … } from 'mongoose'`. **Never** a value import of a type: mongoose is CommonJS, and with `emitDecoratorMetadata` a type import becomes a runtime import that crashes ESM boot.
- The mirror-image rule: an abstract class used as a DI token (e.g. `UsersRepository`) must be a **value** import, otherwise Nest cannot resolve the constructor parameter (`design:paramtypes` is undefined).
- Indexes are declared on the schema (`unique`, compound), not created ad hoc. `autoIndex` is **off in production**.
- References store `ObjectId` with an explicit `ref`; populate is a deliberate choice per query, never a default.
- Money is stored as integer minor units (paise/cents) to avoid float drift.
- Secrets are excluded per-schema (e.g. `select: false` on the password hash).

---

## 7. Code conventions

- **ESM**: relative imports need the `.js` extension (`import { x } from './y.js'`). Module is `nodenext`.
- TypeScript strict; `any` only with a comment explaining why.
- Every endpoint that accepts input has a DTO in the module's `dto/` folder; responses use `ApiSuccessResponseDto`/`ApiErrorResponseDto` in Swagger.
- List endpoints reuse `PaginationQueryDto`.
- Never return a raw Mongoose document containing sensitive fields; use `toJSON` projections or an explicit mapper.
- Shared helpers belong in `common/utils`; domain helpers stay in the module.

---

## 8. Testing strategy

| Layer | Tool | Requires DB? |
| --- | --- | --- |
| Pure helpers (pagination, filters, validators) | Vitest unit specs next to the file | no |
| Module wiring, contracts, guards, throttling | Vitest e2e specs in `test/`, booting the real `AppModule` with the Mongoose connection overridden | no |
| True integration (indexes, transactions, races) | separate suite against a disposable database (Phase 14) | yes |

`npm run verify` runs typecheck → lint → unit → e2e → build. CI-safe: no network, no database.

---

## 9. Adding a feature module

```
src/modules/<feature>/
├── <feature>.module.ts
├── <feature>.controller.ts
├── <feature>.service.ts
├── dto/
│   ├── create-<feature>.dto.ts
│   ├── update-<feature>.dto.ts      # PartialType(CreateDto)
│   └── query-<feature>.dto.ts       # extends PaginationQueryDto
├── schemas/<feature>.schema.ts      # spreads baseSchemaOptions
└── <feature>.service.spec.ts
```

Checklist: DTO on every input · service owns rules and enforces ownership · `@Roles(Role.Admin)` on writes · pagination on lists · `ApiSuccessResponseDto` documented · unit test for the non-trivial rule · e2e test for authorization.

---

## 10. Phases

1. Inspection — `docs/PHASE-1-INSPECTION.md`
2. Bootstrap — `docs/PHASE-2-BOOTSTRAP.md`
3. Common layer — `docs/PHASE-3-COMMON-LAYER.md`
4. Authentication & RBAC — `docs/PHASE-4-AUTH.md`
5. Admin console foundation (layout, navigation, dashboard) — `docs/PHASE-5-ADMIN-DASHBOARD.md` (pulled forward by request; remaining admin modules ship in approved slices)
6. Product management (schema, admin CRUD, image uploads, admin UI) — `docs/PHASE-6-PRODUCTS.md`
7. Category management (hierarchy, images, SEO, storefront browsing) — `docs/PHASE-7-CATEGORIES.md`
8. Inventory management (stock adjustments, audit trail, alerts, order hooks) — `docs/PHASE-8-INVENTORY.md`
9. Order management (checkout, lifecycle, shipping, cancellations, returns, refunds, invoices) — `docs/PHASE-9-ORDERS.md`
10. Customer management (listing, profiles, spending analytics, audited account states, CSV) — `docs/PHASE-10-CUSTOMERS.md`
11. Payment management (Razorpay, webhooks, refunds, console) — `docs/PHASE-11-PAYMENTS.md`
12. Shipping & delivery management (parcels, delivery state machine, courier registry, tracking) — `docs/PHASE-12-SHIPPING.md`
13. Offers, coupons & discounts (percentage/fixed/free shipping, checkout validation, redemption ledger) — `docs/PHASE-13-OFFERS.md`
14. Storefront cart & checkout UI · 15 Reviews, notifications · 16 Caching, queues, performance · 17 Testing, security review, deployment
