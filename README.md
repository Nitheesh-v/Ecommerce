# Ecommerce — Single-Vendor E-Commerce Platform

Production-oriented, single-vendor e-commerce platform. Monorepo with a Next.js (App Router) storefront/admin and a NestJS REST API backed by MongoDB.

> **Status: Phase 3 (common layer) complete.** The API has its request pipeline, response/error contracts, validation, rate limiting and security headers. E-commerce modules start in Phase 4 (auth).
> Docs: [`Architecture`](docs/ARCHITECTURE.md) · [`Phase 1`](docs/PHASE-1-INSPECTION.md) · [`Phase 2`](docs/PHASE-2-BOOTSTRAP.md) · [`Phase 3`](docs/PHASE-3-COMMON-LAYER.md).

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Zustand, Axios |
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
│   ├── src/app/
│   └── package.json
├── docs/
│   ├── ARCHITECTURE.md
│   ├── PHASE-1-INSPECTION.md
│   ├── PHASE-2-BOOTSTRAP.md
│   └── PHASE-3-COMMON-LAYER.md
├── .gitignore
└── README.md
```

Planned module layout (`backend/src/modules/*`, `common/*`, `config/*`) and page layout (`(store)`, `(auth)`, `account`, `admin`) are documented in the inspection report and will be created phase by phase.

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

Health probes are intentionally flat, unthrottled and outside the envelope. Every response carries `X-Request-Id`, and helmet security headers (CSP, `nosniff`, `SAMEORIGIN`, `no-referrer`) are applied to all non-Swagger routes. Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Scripts

Backend: `verify` (typecheck + lint + unit + e2e + build), `smoke` (HTTP probes against a running API), `build`, `start:dev`, `start:prod`, `typecheck`, `lint` (oxlint), `format` (prettier), `test` (Vitest), `test:e2e`, `test:cov`.
Frontend: `dev`, `build`, `start`, `typecheck` (`next typegen && tsc`), `lint`.

E2E tests do not require a database: the Mongoose connection is substituted, so `npm run test:e2e` is CI-safe.

## Database

MongoDB (local or Atlas). The API fails fast when the database is unreachable — 3 bounded retries, then exit code `1` — and `autoIndex` is disabled in production. Atlas setup details (IP allow-list, least-privilege user, URI encoding) are in the Phase 2 report.

## Security notes

- `.env` files are gitignored at both root and package level; only `.env.example` is committed.
- Never commit credentials, API keys, or tokens. Payment and upload integrations (Razorpay, Cloudinary) will read secrets from the environment only.

## Roadmap

Phases 1–14: inspection → bootstrap → common layer → **auth/RBAC** → users → catalog → cart/wishlist → inventory → orders → payments → admin → coupons/reviews/notifications → performance → testing & deployment. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#10-phases) for the current state.
