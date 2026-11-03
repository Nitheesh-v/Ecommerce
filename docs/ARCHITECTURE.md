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
│   │       └── auth/               # tokens, sessions, guards, auth flows
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

`modules/` does not exist yet; each feature adds its own directory there.

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
5. Users & profiles · 6 Products & categories · 7 Cart & wishlist · 8 Inventory · 9 Orders & checkout · 10 Payments (Razorpay) · 11 Admin · 12 Coupons, reviews, notifications · 13 Caching, queues, performance · 14 Testing, security review, deployment
