# Ecommerce — Single-Vendor E-Commerce Platform

Production-oriented, single-vendor e-commerce platform. Monorepo with a Next.js (App Router) storefront/admin and a NestJS REST API backed by MongoDB.

> **Status: Phase 2 (bootstrap) complete.** Both apps build, lint, type-check and test cleanly; the backend boots and serves health/readiness endpoints. No e-commerce features yet.
> Reports: [`Phase 1 — inspection`](docs/PHASE-1-INSPECTION.md) · [`Phase 2 — bootstrap`](docs/PHASE-2-BOOTSTRAP.md).

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
│   ├── PHASE-1-INSPECTION.md
│   └── PHASE-2-BOOTSTRAP.md
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

Phases 1–14 (inspection → architecture → auth → users → catalog → cart/wishlist → inventory → orders → payments → admin → coupons/reviews/notifications → performance → testing & deployment) are tracked in [`docs/PHASE-1-INSPECTION.md`](docs/PHASE-1-INSPECTION.md#11-phase-map-after-this-inspection).
