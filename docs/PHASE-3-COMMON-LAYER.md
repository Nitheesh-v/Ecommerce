# Phase 3 — Backend Architecture & Common Layer

**Goal:** give the API one request pipeline, one response contract, one error contract, and the shared pieces every later module will reuse — without writing any e-commerce business logic.

**Status: complete and verified.**

---

## 1. What was added

| Area | File | Purpose |
| --- | --- | --- |
| Setup | `src/app.setup.ts` | prefix, cookie parser, helmet, CORS, Swagger — called by `main.ts` **and** e2e tests |
| Module | `src/app.module.ts` | global `ValidationPipe`, `ThrottlerGuard`, interceptors, exception filter, request-id middleware |
| Errors | `src/common/filters/all-exceptions.filter.ts` | single `ApiErrorBody`, 4xx/5xx logging, duplicate-key/CastError mapping, no stack leaks |
| Errors | `src/common/exceptions/passthrough-http.exception.ts` | escape hatch for health probes |
| Success | `src/common/interceptors/response.interceptor.ts` | `{ success, data, meta? }` envelope |
| Logging | `src/common/interceptors/logging.interceptor.ts` | one line per request with status, duration, request id |
| Correlation | `src/common/middleware/request-id.middleware.ts` | `x-request-id` generated/reused and echoed |
| Validation | `src/common/dto/pagination-query.dto.ts` | reusable `page/limit/search/sort/order` with bounds |
| Helpers | `src/common/utils/pagination.util.ts` | `getSkip`, `createPaginationMeta`, `createPaginatedResult` |
| Guards' vocabulary | `src/common/decorators/{public,roles,current-user}.decorator.ts` | `@Public()`, `@Roles()`, `@CurrentUser()` ready for Phase 4 |
| Types | `src/common/enums/role.enum.ts`, `src/common/interfaces/*` | `Role`, `AuthenticatedUser`, `RequestWithContext` |
| DB | `src/database/base.schema.ts` | `baseSchemaOptions` (timestamps, no `__v`, `_id → id`) |
| Config | `src/config/env.validation.ts` | `THROTTLE_TTL`, `THROTTLE_LIMIT` |
| Tests | `src/common/**/*.spec.ts`, `test/hardening.e2e-spec.ts`, `test/rate-limit.e2e-spec.ts`, `test/support/*` | unit + e2e coverage of the layer |

Dependencies added: `@nestjs/throttler` (peer-supports Nest 12), `helmet`, `cookie-parser` (+ `@types/cookie-parser`). No others.

---

## 2. The contracts

### Success

```json
{ "success": true, "data": { … } }
```

### Paginated

```json
{ "success": true, "data": [ … ], "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7, "hasNextPage": true, "hasPreviousPage": false } }
```

### Error

```json
{
  "success": false, "statusCode": 400, "error": "Bad Request",
  "message": "Validation failed",
  "details": ["limit must not be greater than 100"],
  "path": "/api/probe?limit=1000", "method": "GET",
  "timestamp": "2026-11-03T10:55:00.000Z", "requestId": "3c9f…"
}
```

Status mapping: validation → `400`, duplicate key → `409`, bad ObjectId → `400`, unexpected → `500` with `"Internal server error"` in production.

### Infrastructure (unwrapped, unthrottled)

`GET /api/health`, `GET /api/health/ready` — flat bodies, because orchestrators and monitors read them directly.

---

## 3. Design decisions worth remembering

1. **`app.setup.ts` is shared by `main.ts` and the tests.** Global prefix, helmet and CORS exist in exactly one place, so a passing e2e test means the shipped app behaves the same way.
2. **Global providers live in `AppModule`** (`APP_PIPE`, `APP_GUARD`, `APP_INTERCEPTOR`, `APP_FILTER`), so *any* module that imports `AppModule` — including test modules — inherits identical behaviour. Nothing is applied ad hoc with `useGlobalX()`.
3. **Envelope opt-out is explicit.** `@SkipResponseEnvelope()` is metadata, not a heuristic; only health uses it. A test module adding real routes automatically gets the envelope.
4. **Swagger gets helmet without CSP.** Disabling CSP globally would be a real downgrade; instead `/api/docs*` is exempt from helmet so the UI renders.
5. **Throttling defaults are global, tuning is env.** `THROTTLE_LIMIT`/`THROTTLE_TTL` (seconds → ms internally). Health is `@SkipThrottle()`. Phase 4 will add stricter per-route limits on auth endpoints.
6. **`transformOptions.enableImplicitConversion: false`.** Implicit conversion silently turns `"abc"` into `NaN` in some places and `true` into `1` in others. DTOs declare `@Type(() => Number)` explicitly instead.
7. **`forbidNonWhitelisted: true`.** A typo like `?pageSize=10` is a `400`, not a silently ignored parameter — proven by an e2e test.
8. **Mongoose helpers stay option-only.** Mongoose 9's generic `Schema<T>` typing does not survive a generic factory, so `baseSchemaOptions` is spread into each `@Schema()` decorator. Still one source of truth, no casts.

---

## 4. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | ✅ 0 errors |
| `npm run lint` (oxlint) | ✅ 0 warnings, 0 errors (36 files) |
| `npm run test` | ✅ **23 passed** |
| `npm run test:e2e` | ✅ **19 passed** (4 files) |
| `npm run build` | ✅ |
| Real ESM boot (`node dist/main.js`) | ✅ imports of helmet/cookie-parser/throttler load; env failure still exits 1 |
| Bad URI | ✅ 3 bounded retries then exit |

What the e2e suite actually asserts:

- helmet headers present (`nosniff`, `SAMEORIGIN`, CSP, `no-referrer`);
- `x-request-id` generated as a UUID, reused when supplied, echoed in error bodies;
- `GET /api` returns `{ success: true, data: 'Hello World!' }`;
- health stays flat (`success: true, message`, no `data`);
- DTO conversion works (`?page=2&limit=5&order=asc` → numbers);
- `?limit=1000` → `400` with a `details` array naming the field;
- `?pageSize=10` (unknown parameter) → `400`;
- 404 has the standard error body and no `stack`;
- rate limit: `THROTTLE_LIMIT=2` allows two requests then `429` in the standard shape, while `/api/health` is never throttled.

Not verifiable here: Swagger HTML with helmet bypass over a real socket (needs a live process); covered indirectly by `configureApp` unit-level behaviour and by your local `npm run smoke`.

---

## 5. Local verification

```powershell
cd C:\Users\megal\Desktop\Ecommerce26\backend
npm run verify
npm run start:dev
```

Then, in a second window:

```powershell
npm run smoke
```

Expected additions visible locally: `x-request-id` and helmet headers on every response.

```powershell
curl.exe -i http://localhost:5000/api/health          # flat body + security headers
curl.exe -i http://localhost:5000/api/does-not-exist  # error envelope
curl.exe -i "http://localhost:5000/api/health?page=2" # health ignores query
```

---

## 6. Remaining gaps (intentional)

- `AppController`/`GET /api` is still the scaffold smoke route; deleted when catalog modules land.
- No auth yet: `@Public()`, `@Roles()`, `@CurrentUser()` are vocabulary only; nothing enforces them until Phase 4's `JwtAuthGuard` + `RolesGuard` are registered as `APP_GUARD` (which is why they are not registered now — a guard with no strategy would lock the API).
- Throttler storage is in-memory (single instance). Redis-backed storage in Phase 13.
- No request-body size limit config, no compression, no structured JSON logging — Phase 13.
- `docs/API_DOCUMENTATION.md` is deferred until real endpoints exist (Swagger is the live reference).

---

## 7. Next task — Phase 4: authentication & RBAC

Scope:

1. `users` module: `User` schema (`email` unique lowercase, `passwordHash` with `select: false`, `role`, `isActive`, email verification fields), repository-style service.
2. `auth` module: register, login, refresh, logout, `me`.
3. Hashing with **bcrypt** (cost from env, default 12).
4. Access token (15 m, `JWT_ACCESS_SECRET`) + refresh token rotation (`JWT_REFRESH_SECRET`), refresh stored as a hashed jti per session so it can be revoked; delivered in `HttpOnly; Secure; SameSite=Lax` cookie scoped to `/api/auth`.
5. `JwtAuthGuard` (`APP_GUARD`, deny-by-default with `@Public()`) + `RolesGuard` (`APP_GUARD`); `@CurrentUser()` wired.
6. Stricter throttling on login/register/refresh (`@Throttle`).
7. Seed script for the single admin account (env-driven credentials, never committed).
8. e2e: register → login → me → refresh rotation → reuse of a rotated token rejected → logout revokes → customer cannot reach an admin route (`403`).

Completion criteria: all Phase 3 checks stay green; the flows above pass as e2e tests with a stubbed user repository; no token ever appears in a response body (cookie only) and no password hash can be serialised.
