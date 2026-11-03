# Phase 2 — Bootstrap Correction

**Goal:** make the backend compile, boot, and serve health/readiness endpoints, and make the frontend build deterministically — with **no e-commerce features** and minimal dependency changes.

**Status: complete and verified.**

---

## 1. What was wrong (from the Phase 1 report)

| # | Defect | Effect |
| --- | --- | --- |
| 1 | `HealthModule` imported from a non-existent file | `nest build` failed |
| 2 | `HealthModule` pasted inside `ConfigModule.forRoot({...})` options | type error + module never registered |
| 3 | `./app.module` imported without `.js` under `nodenext` ESM | type error |
| 4 | `AppModule` had no `controllers`/`providers` | `AppController` dead, no routes served |
| 5 | No env schema, no `.env.example` | silent misconfiguration |
| 6 | `next/font/google` fetched Geist at build time | build needed network access |
| 7 | `tsc --noEmit` failed on a clean frontend checkout | `LayoutProps` only exists after `next typegen` |

---

## 2. Files changed

### Backend

| File | Change |
| --- | --- |
| `src/config/env.validation.ts` | **new** — Zod schema + `validateEnv()` + `ValidatedEnv` type |
| `src/config/env.validation.spec.ts` | **new** — 8 unit tests for defaults, coercion, and rejections |
| `src/health/health.service.ts` | **new** — liveness payload + readiness check against `connection.readyState` |
| `src/health/health.module.ts` | **new** — declares controller + service |
| `src/health/health.controller.ts` | **modified** — `GET /health` (liveness) and `GET /health/ready` (readiness, 503 when down), Swagger tags |
| `src/app.module.ts` | **rewritten** — real `imports` (Config → Mongoose → Health), `controllers`, `providers`, validated env, bounded Mongoose retries |
| `src/main.ts` | **rewritten** — ESM-correct import, typed `ConfigService`, CORS from `FRONTEND_URL` list, conditional Swagger, `enableShutdownHooks()`, binds `0.0.0.0`, explicit port number, top-level `await` with redacted failure log |
| `test/app.e2e-spec.ts` | **rewritten** — health routes tested against a stubbed connection (no database required) |
| `test/app.module.e2e-spec.ts` | **new** — boots the real `AppModule` with a stubbed connection; asserts `/api`, `/api/health`, `/api/health/ready`, 404 |
| `vitest.config.ts`, `vitest.config.e2e.ts` | native `resolve.tsconfigPaths` (Vite 8) instead of the deprecated `vite-tsconfig-paths` plugin |
| `oxlint.json` | rule namespace corrected to `typescript/*` |
| `package.json` | `typecheck` script added; `zod` added; `vite-tsconfig-paths` removed |
| `.env.example` | `SWAGGER_ENABLED`, token lifetimes; secret placeholders stay commented |

### Frontend

| File | Change |
| --- | --- |
| `src/app/layout.tsx` | self-hosted Geist via the `geist` package (no build-time Google Fonts fetch), real `metadata` (title template + description) |
| `src/app/globals.css` | body font now uses the `--font-sans` token instead of hardcoded Arial |
| `package.json` | `typecheck` script (`next typegen && tsc --noEmit`), `geist` added |
| `tsconfig.json` | `target` `ES2017` → `ES2022` |

---

## 3. Architecture of the change

### Configuration flow

```
process.env + backend/.env
        │
        ▼
ConfigModule.forRoot({ isGlobal, cache, validate: validateEnv })
        │  zod safeParse → defaults applied, types coerced (PORT: string → number)
        ▼
ConfigService<ValidatedEnv, true>          ← typed, `infer: true` reads
        ├── main.ts        → PORT, NODE_ENV, FRONTEND_URL, SWAGGER_ENABLED
        └── app.module.ts  → MONGODB_URI, NODE_ENV (autoIndex)
```

Invalid or missing variables now abort startup with an aggregated, readable message **before** any port is bound:

```
Error: Invalid environment configuration:
  - MONGODB_URI: Invalid input: expected string, received undefined
```

### Health endpoints

| Endpoint | Purpose | Behaviour |
| --- | --- | --- |
| `GET /api/health` | liveness | always `200`; no dependency is touched |
| `GET /api/health/ready` | readiness | `200` when `readyState === 1`, otherwise `503` with the failing check |
| `GET /api/docs` | Swagger UI | only when `SWAGGER_ENABLED` (default: on outside production) |

Example — healthy:

```json
{
  "success": true,
  "status": "ok",
  "timestamp": "2026-11-03T10:40:00.000Z",
  "uptimeSeconds": 12,
  "checks": { "database": { "status": "up", "state": "connected", "name": "ecommerce", "host": "cluster0-shard-0/ac-xxxx.mongodb.net" } }
}
```

Example — database down (`GET /api/health/ready`, HTTP 503):

```json
{
  "success": false,
  "status": "degraded",
  "timestamp": "2026-11-03T10:40:00.000Z",
  "uptimeSeconds": 12,
  "checks": { "database": { "status": "down", "state": "disconnected" } }
}
```

### Mongoose connection policy

- **Fail fast, don't hang:** `serverSelectionTimeoutMS: 10s`, `retryAttempts: 3`, `retryDelay: 3s` → a bad URI or unreachable Atlas cluster aborts boot in ~26s with exit code `1` instead of retrying forever.
- **`autoIndex` disabled in production:** index builds move to an explicit migration step so startup is deterministic and not a write-storm on a production cluster.

> Deliberately **not** lazy: if the database is unreachable at boot the process exits nonzero, so an orchestrator can restart/fail the deploy rather than serving a half-broken API. The cost is that liveness is only reachable once Mongo connects — acceptable while the API is a single container; revisit if API and DB are deployed independently.

### ESM detail worth remembering

`mongoose` 9 is CommonJS. With `emitDecoratorMetadata: true`, a **type-only** import of `Connection` is emitted as a real value import, and Node then throws:

```
SyntaxError: Named export 'Connection' not found. The requested module 'mongoose' is a CommonJS module
```

`npx tsc` and Vitest both pass, so only a real `node dist/main.js` reveals it. Fix in place: `import type { Connection } from 'mongoose'` (injection uses the `@InjectConnection()` token, not the emitted type). **Rule for later phases: import Mongoose types with `import type`.**

---

## 4. Verification performed

| Check | Command | Result |
| --- | --- | --- |
| Type check | `npx tsc --noEmit` | ✅ 0 errors |
| Lint | `npm run lint` (oxlint) | ✅ 0 warnings, 0 errors |
| Unit tests | `npm run test` | ✅ 9 passed (2 files) |
| E2E tests | `npm run test:e2e` | ✅ 8 passed (2 files), no database needed |
| Production build | `npm run build` | ✅ `dist/` with ESM output |
| Missing env | `env -u MONGODB_URI node dist/main.js` | ✅ readable error, exit 1 |
| Database down | unreachable `MONGODB_URI` | ✅ 3 bounded retries, exit 1 |
| Frontend typecheck | `npm run typecheck` | ✅ `next typegen` + `tsc` clean |
| Frontend lint | `npx eslint .` | ✅ clean |
| Frontend build | `npm run build` | ✅ compiled, 2 static routes, no network needed |

Not verifiable in this environment: a **successful** Mongo connection and Swagger over HTTP — no MongoDB is installed and MongoDB Atlas is not reachable from the sandbox. Both are covered by the two `AppModule`/`HealthModule` e2e suites (which assert the exact routing and readiness payloads) and should be confirmed locally with the commands below.

---

## 5. Run it locally

```bash
# Backend
cd backend
cp .env.example .env          # set MONGODB_URI to your Atlas string
npm install
npm run verify                # typecheck + lint + unit + e2e + build
npm run start:dev
# → API  http://localhost:5000/api
# → Docs http://localhost:5000/api/docs

# Frontend (separate terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev
# → App  http://localhost:3000
```

Smoke tests (cross-platform, works in PowerShell too):

```bash
npm run smoke     # from backend/, while start:dev is running
```

Raw HTTP, any platform:

```bash
curl.exe -i http://localhost:5000/api/health        # Windows PowerShell 5.1
curl -i http://localhost:5000/api/health/ready      # bash / PowerShell 7+
```

> **Windows note:** PowerShell 5.1 does not support `&&` as a command separator, and `curl` there is an alias for `Invoke-WebRequest` (so `curl -i` fails). Use `;`, separate lines, `curl.exe`, or the `verify`/`smoke` npm scripts.

### Atlas checklist

1. **IP allow-list** — add your current public IP (`curl ifconfig.me`) or `0.0.0.0/0` for local-only development.
2. **Database user** — a dedicated user with `readWrite` on the app database only; never the admin user.
3. **Database name in the URI** — `mongodb+srv://user:pass@cluster0.xxxx.mongodb.net/ecommerce`. Omitting it connects to `test`.
4. **URL-encode special characters** in the password (`@` → `%40`, `:` → `%3A`, `/` → `%2F`).
5. **TLS** is implied by `mongodb+srv` — do not disable it.

---

## 6. Remaining known gaps (by design, next phases)

- `AppController`/`AppService` (`GET /api` → `"Hello World!"`) are still the scaffold smoke test; they will be removed when real modules land.
- No `common/` layer yet: global exception filter, response envelope, interceptors, guards, throttler, helmet, cookie-parser, CORS allow-list hardening → **Phase 3**.
- No stdout log hygiene / request IDs / structured logging yet.
- `docs/ARCHITECTURE.md` and `docs/API_DOCUMENTATION.md` are not written yet (Phase 3 and onward).
- No root `package.json` yet, so `npm run dev` at the repo root does nothing (planned, additive).

---

## 7. Next task — Phase 3: backend architecture & common utilities

Scope (no business logic):

1. `src/common/filters/http-exception.filter.ts` — one error shape: `{ success: false, statusCode, message, errors?, path, timestamp }`; stack traces only in development.
2. `src/common/interceptors/response.interceptor.ts` — success envelope `{ success: true, data, meta? }`.
3. `src/common/dto/pagination-query.dto.ts` — reusable `page`/`limit`/`sort`/`search` DTO with validation.
4. `src/common/decorators/` — `@CurrentUser()`, `@Roles()`, `@Public()` scaffolding.
5. `src/database/` — `database.module.ts` wrapper + a base schema (`timestamps: true`, `toJSON` transform for `_id` → `id`).
6. Hardening in `main.ts`: `helmet`, `cookie-parser`, `@nestjs/throttler` (global default + per-route overrides later), request logging with request IDs.
7. `api/docs` gated behind env in production (already env-driven).
8. Update `docs/ARCHITECTURE.md`; add these to the README.

Completion criteria: all Phase 2 checks still green; error/response shapes covered by unit + e2e tests; `helmet` headers visible in a `curl -I`; throttling returns `429` after N requests on a test route.

Decisions locked in: **Zod** for env validation, **bcrypt** for password hashing (Phase 4), MongoDB Atlas as the target database.
