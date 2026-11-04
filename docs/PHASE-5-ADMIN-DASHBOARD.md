# Phase 5 — Admin Console Foundation

> **Scope approved for this phase:** inspect the project → verify admin auth/RBAC → admin layout → responsive sidebar → top navigation → dashboard UI → connect dashboard metrics to real APIs → report missing APIs. **Product management and every other admin module are deliberately out of scope** and start only after approval.
>
> Result: a guarded `/admin` console with a working, API-driven dashboard. No hardcoded statistics, no fake data, no tokens in `localStorage`.

---

## 1. Inspection findings

Checked before writing any code.

| Area | Finding |
| --- | --- |
| Admin auth (backend) | Already in place from Phase 4: global `JwtAuthGuard` (deny by default), `RolesGuard`, `Role` enum, `@Roles(Role.Admin)`, `@Public()`, `@CurrentUser()`. No dedicated `admin` module existed. |
| Admin auth (frontend) | **Nothing existed.** The frontend was still the untouched Next.js starter: no API client, no store, no auth flow, no `(store)`/`account`/`admin` routes. |
| Dashboard data | **No analytics endpoint existed**, and no `products`/`categories`/`orders`/`customers` modules either — so no admin API to consume. |
| Session contract | `POST /api/auth/login` → `{ user, accessToken, tokenType }` in the body + `refresh_token` HttpOnly cookie scoped to `/api/auth`; `POST /api/auth/refresh` rotates it; `POST /api/auth/logout` revokes it. |
| Response envelope | `{ success: true, data, meta? }` / `{ success: false, statusCode, error, message, details?, path, method, timestamp, requestId }` — the frontend parses exactly this. |
| Dependencies | Frontend had only `axios`, `geist`, `next`, `react`, `zustand` (+ Tailwind, TS). **No icon library, no chart library, no form library.** |

Two gaps therefore blocked a real dashboard, and both were closed in this phase:

1. an **admin analytics API** (the dashboard cannot be "real" without it), and
2. the **entire frontend application shell** (session handling, guarded routes, design system).

---

## 2. Backend changes

New module: `backend/src/modules/admin/`.

| File | Purpose |
| --- | --- |
| `admin.module.ts` | Registers `DashboardService` and binds `DashboardRepository` → `MongoDashboardRepository`. |
| `admin.controller.ts` | `GET /api/admin/dashboard/overview`, class-level `@Roles(Role.Admin)` + `@ApiBearerAuth()`. |
| `dashboard.service.ts` | Runs the eight reads in parallel (`Promise.all`), fills date gaps, composes `DashboardOverview`. |
| `dto/dashboard-query.dto.ts` | `range=today\|7d\|30d\|90d\|custom` (default `30d`), optional ISO `from`/`to`. |
| `repositories/dashboard.repository.ts` | Abstract class used as the DI token + read-model interfaces (also the documented **collection contract**). |
| `repositories/mongo-dashboard.repository.ts` | Aggregation pipelines; money in minor units. |
| `utils/date-range.util.ts` | Preset/custom range resolution, bucket generation, validation. |

### Endpoint

```
GET /api/admin/dashboard/overview?range=30d
GET /api/admin/dashboard/overview?range=custom&from=2026-10-01T00:00:00.000Z&to=2026-10-31T23:59:59.999Z
```

```jsonc
{
  "success": true,
  "data": {
    "range": { "key": "30d", "from": "…", "to": "…", "label": "1 Oct – 30 Oct 2026" },
    "generatedAt": "…",
    "metrics": {
      "revenue": 1284500,        // minor units (paise)
      "orders": 42,
      "products": 128,
      "customers": 310,
      "pendingOrders": 6,
      "lowStockProducts": 4,
      "averageOrderValue": 30583
    },
    "revenueSeries": [{ "date": "2026-10-01", "value": 0 }],
    "ordersSeries": [{ "date": "2026-10-01", "value": 2 }],
    "orderStatusDistribution": [{ "status": "delivered", "count": 21 }],
    "salesByCategory": [{ "category": "Audio", "revenue": 540000, "orders": 18 }],
    "recentOrders": [{ "id": "…", "orderNumber": "ORD-1042", "customerName": "…", "total": 129900, "status": "paid", "paymentStatus": "paid", "createdAt": "…" }],
    "topProducts": [{ "id": "…", "name": "…", "unitsSold": 12, "revenue": 240000 }],
    "lowStock": [{ "id": "…", "name": "…", "sku": "SKU-1", "stock": 2, "lowStockThreshold": 5 }],
    "recentCustomers": [{ "id": "…", "name": "…", "email": "…", "createdAt": "…" }]
  }
}
```

Rules that matter:

- **Authorization is server-side**: the controller requires `Role.Admin`; a customer token gets `403`, an anonymous call `401`. Covered by e2e tests.
- **Revenue** = orders with `paymentStatus: 'paid'` that are not `cancelled`/`returned`, inside the window. `averageOrderValue = round(revenue / paidOrders)`.
- **Date presets are whole UTC days ending today** (today = 1 bucket, 7d = 7, 30d = 30, 90d = 90). Series are **zero-filled**, so a quiet day plots as 0 instead of being interpolated away.
- `custom` requires **both** `from` and `to`, rejects inverted ranges and windows longer than 366 days with `400`.
- **Missing collections return zeros**, not errors — the dashboard honestly renders empty states until the catalog/order modules exist.

### Collection contract (must match in later phases)

`mongo-dashboard.repository.ts` documents the exact shape it reads: `users` (`firstName`, `lastName`, `email`, `role`, `createdAt`), `products` (`name`, `categoryId`, `stock`, `lowStockThreshold`, `isArchived`), `categories` (`name`), `orders` (`orderNumber`, `customerId`, `customerName`, `customerEmail`, `items[{ productId, name, quantity, unitPrice }]`, `total`, `status`, `paymentStatus`, `createdAt`). Product, category, order and customer modules must be built against this contract — otherwise the dashboard stays empty.

---

## 3. Frontend architecture

```
frontend/src/
├── app/admin/
│   ├── layout.tsx                  # metadata: noindex, title template
│   ├── login/page.tsx              # public, outside the guard
│   └── (console)/
│       ├── layout.tsx              # <AdminShell> — the guard
│       ├── page.tsx                # /admin → /admin/dashboard
│       └── dashboard/page.tsx
├── components/admin/
│   ├── auth/admin-login-form.tsx
│   ├── layout/{admin-shell,admin-sidebar,admin-header,popover,nav-config}.tsx
│   ├── ui/{card,button,input,badge,table,states}.tsx
│   └── dashboard/{dashboard-view,stat-cards,trend-charts,order-status-card,
│                  category-sales-card,recent-orders-table,side-lists,
│                  activity-feed,range-filter,chart-tooltip}.tsx
├── hooks/use-dashboard-overview.ts
├── lib/
│   ├── api/{session,client,errors}.ts
│   └── utils.ts                    # cn(), currency/date/compact formatters
├── services/{auth.service,admin/dashboard.service}.ts
├── store/{auth.store,ui.store}.ts
└── types/{auth,admin}.ts
```

### Session & HTTP layer

| Concern | Implementation |
| --- | --- |
| Access token | **Module memory only** (`lib/api/session.ts`). No `localStorage`, no `sessionStorage`, no readable cookie. A reload starts empty. |
| Reload recovery | `AdminShell` calls `bootstrap()` → `POST /auth/refresh` using the HttpOnly cookie → new access token + user. |
| 401 handling | Axios response interceptor refreshes **once** (single-flight promise shared by concurrent requests) and replays the original request with `_retried` set. Failure clears the session and fires `onExpired`. |
| Login/refresh/logout | Excluded from the retry loop (no recursion). |
| Errors | `getApiErrorMessage()` maps the API envelope to a safe user message; network/timeout/429 get specific copy; nothing internal leaks. |
| Redirect safety | `next` is accepted only when it starts with `/admin` (open-redirect guard). |

Layering rule: `store → service → client`, and `client → session` (never back into the store), so there is no import cycle. The store subscribes to `session` changes so a background refresh or expiry updates the UI without extra plumbing.

### Route protection

`AdminShell` renders a skeleton while `status` is `idle`/`loading`, redirects to `/admin/login?next=…` when unauthenticated, and shows an "admin access required" panel for a signed-in **customer** (with sign-out). This is **UX only** — the API re-checks the role on every request, so tampering with the client cannot read admin data. A middleware would need to validate the JWT server-side; that is intentionally deferred (no duplicated auth logic, no secrets in the Next runtime).

### Design language

Light neutral canvas (`bg-slate-50`), white cards with 1px `slate-200` borders and a near-invisible shadow, **dark sidebar** (`bg-slate-900`), a single indigo accent for the active/primary state, and status colours used only for status (emerald/amber/rose/sky). No decorative gradients; the only gradient is the revenue area fill. Type scale: 18px page heading (header), 14px card body, 12px labels, 11px uppercase table headers. Spacing on a 4px grid, cards padded 16–20px.

### Components

- **Sidebar** — 12 items in 6 groups, active item marked with a white pill + 2px indigo rail, collapses to a 76px icon rail on desktop, off-canvas drawer with scrim below `lg`. Items whose module does not exist yet are rendered as non-clickable rows with a `Soon` chip rather than dead links.
- **Top bar** — mobile menu, desktop collapse toggle, page title + clickable breadcrumb, global search (disabled until a search API exists), notifications popover (honest empty state), profile menu (name, role, sign out).
- **Dashboard** — 6 metric cards, revenue area chart, orders bar chart, order-status donut with share %, category ranking bars, recent-orders table, top products, low-stock alerts, new customers, and an activity feed **composed from those same real records** (there is no audit-log endpoint yet, so nothing is invented).
- **Charts** — Recharts, black/white tooltips, formats: `₹1.2L` style compact INR ticks, full currency in tooltips. Empty series render a real empty state, never a flat line implying zero demand.

### States

Loading (skeletons that match final layout), background refresh (`Updating…` badge, previous numbers stay visible), error (inline banner + Retry), empty (per-section copy explaining *why* it is empty), and keyboard/a11y basics (focusable controls, `aria-current`, `aria-pressed`, `aria-busy`, Escape closes popovers, labels on icon buttons).

### Responsive behaviour

| Breakpoint | Behaviour |
| --- | --- |
| `< 640px` | Sidebar is a drawer; metric cards stack; tables scroll horizontally (`min-w-36rem`); date filter wraps; chart cards full width. |
| `640–1024px` | 2-up metric cards; sidebar still a drawer; charts full width. |
| `1024–1280px` | Sidebar visible (collapsible); 3-up metrics; chart + side-card share a 3-column grid at `xl`. |
| `≥ 1536px` | 6-up metric row; 3-column lower sections. |

### Dependencies added (each justified)

| Package | Version | Why |
| --- | --- | --- |
| `lucide-react` | 1.67.0 | Icons named in the brief; tree-shaken, no runtime cost. |
| `recharts` | 3.10.1 | React 19-compatible area/bar/pie charts; avoids hand-rolling SVG axes/tooltips. |
| `clsx` + `tailwind-merge` | 2.1.1 / 3.7.0 | `cn()` so conditional class merging is predictable (no duplicated utilities). |
| `react-hook-form` | 7.91.0 | The project's stated form stack; validates the login form and is reused by every admin form next. |
| `zod` + `@hookform/resolvers` | 4.6.7 / 7.0.2 | Schema validation shared in shape with the backend DTOs. |

---

## 4. Security posture

| Requirement | Status |
| --- | --- |
| Admin auth enforced by backend guards | ✅ `@Roles(Role.Admin)` on the admin controller, deny-by-default globally |
| Never trust frontend roles | ✅ the UI only *hides* things; every read is re-authorized server-side |
| No tokens in `localStorage` | ✅ access token lives in a module variable; refresh token is HttpOnly |
| Refresh handling | ✅ single-flight refresh + retry-once, then hard sign-out |
| No secrets in the frontend | ✅ only `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_APP_NAME` are read |
| Safe errors | ✅ API messages only, generic fallbacks for the rest |
| Rate limiting | ✅ inherited: login 10/min, refresh 30/min, global throttle |

---

## 5. Wired vs. missing

**Wired to real APIs now:** admin login/logout/session, and every number/chart/table on the dashboard.

**Missing APIs** (i.e. what each nav item still needs):

| Module | Needed endpoints |
| --- | --- |
| Products | `GET/POST/PATCH/DELETE /api/admin/products`, image upload, bulk stock update |
| Categories | `GET/POST/PATCH/DELETE /api/admin/categories` (+ tree) |
| Inventory | stock adjustments with reason + history, `GET /api/admin/inventory/low-stock` |
| Orders | list/detail/filter, `PATCH /api/admin/orders/:id/status` with transition rules, invoice |
| Customers | list/detail with aggregates, block/unblock |
| Payments | list/detail, refunds, Razorpay verification/webhook |
| Coupons | CRUD + validation rules |
| Reviews | moderation queue, approve/reject (verified-purchase gate) |
| Reports | revenue/orders/products exports (CSV/XLSX), date-range aggregates |
| Notifications | list, mark read, low-stock/order events |
| Settings | store profile, shipping/tax, payment keys (write-only, never returned) |
| Global search | `/api/admin/search?q=` |
| Activity feed | an audit-log endpoint (currently composed client-side) |
| Admin identity | a dedicated `/api/admin/auth/*` (today: `POST /api/auth/login` + role check) |

The sidebar marks every one of these as `Soon`; no nav item points at a 404.

---

## 6. Verification

Run from the repo root (each line is PowerShell-safe):

```powershell
cd backend
npm run verify        # typecheck -> lint -> 40 unit -> 42 e2e -> build

cd ..\frontend
npm run typecheck
npm run lint
npm run build
```

Results in this environment:

| Check | Result |
| --- | --- |
| `backend: tsc --noEmit` | clean |
| `backend: unit (vitest)` | **40 passed** (7 files) — includes 8 date-range + 4 dashboard-service specs |
| `backend: e2e (vitest)` | **42 passed** (6 files) — includes 6 admin-dashboard tests (401 anonymous, 403 customer, 200 admin, custom range, 2× 400 validation) |
| `frontend: typecheck` | clean |
| `frontend: lint` (eslint) | clean |
| `frontend: build` (next build) | clean — routes `/`, `/admin`, `/admin/dashboard`, `/admin/login` |
| Smoke (`next start` + HTTP) | `/admin/login` and `/admin/dashboard` return `200`; `/admin` redirects to `/admin/dashboard` |

Not covered here (needs your machine): a real MongoDB + Atlas connection, and a visual pass in a browser.

---

## 7. Run it locally

```powershell
# terminal 1 — API
cd backend
npm run start:dev

# terminal 2 — web
cd frontend
npm run dev
```

Then open `http://localhost:3000/admin`.

First time only (from `backend/`): `npm run seed:admin` after adding `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` to `.env`. `JWT_ACCESS_SECRET` (≥ 32 chars) is now **required** — the API exits at boot without it.

Sign in with the seeded admin. A customer account is rejected with an explicit message and its session is revoked.

### What you will see on a fresh database

Empty states, not zeros with fake motion: "No revenue in this period", "No orders to break down", "Stock levels look healthy". That is correct — `products`, `categories` and `orders` do not exist yet, so the aggregations return an empty store. The dashboard fills itself as soon as those modules land.

---

## 8. Decisions & limitations

1. **Admin was moved ahead of the original roadmap** (was phase 11) because you asked for it now. Catalog, orders and payments are unchanged in scope — the dashboard was built against a documented collection contract so it becomes live the moment those modules write matching documents.
2. **Client-side guard only** (no Next middleware): a middleware would have to validate the JWT server-side, duplicating the API's auth logic and putting a secret in the Next runtime. The API remains the single authority.
3. **Global search and notifications are present but inert**, and labelled as such. Wiring them to fake data would violate "no hardcoded stats"; they activate with their endpoints.
4. **No dark mode** in the console yet (the brief specified a light canvas with a dark sidebar). Easy to add later via CSS variables.
5. **No pagination/lists yet** — every dashboard list is a fixed top-N (5–6) from the API, which is what the endpoint returns.
6. **Recharts adds ~100 KB gzipped** to admin routes only; it is not imported by the storefront.
7. **`export const instant = false` on every `admin/(console)` page.** `next.config.ts` enables `cacheComponents` + `partialPrefetching`, so Next 16 validates each route's instant-navigation shell in dev. `AdminShell` renders only a skeleton on the server (the token lives in the browser), so the page segment never renders and Next reports it as "dropped from rendering". The flag is page-level only — the same export on a layout is ignored — and it affects validation, not rendering.

---

## 9. Next phase — pending your approval

Proposed: **Product & category management**, slice by slice.

1. `products` + `categories` Mongoose schemas matching the dashboard's collection contract (integer minor-unit prices, `sku`, `stock`, `lowStockThreshold`, `isArchived`, soft delete).
2. `GET/POST/PATCH/DELETE /api/admin/products` with pagination, search, filters, `@Roles(Role.Admin)`, DTO validation, unique SKU/slug handling, and e2e tests (401/403/validation/conflict).
3. Admin product list (responsive table, search, filters, pagination, empty/loading/error), then create/edit forms (RHF + Zod) with image URL upload.
4. Category CRUD + tree, then wire the dashboard's `salesByCategory` and inventory counters to the new collections.

Three decisions I need from you before starting:

- **Images**: Cloudinary integration now, or plain image URLs first and Cloudinary in a later phase?
- **Product model**: simple fields only (name, slug, description, price, compareAtPrice, sku, stock, category, images, status), or variations (size/colour) from the start? Variations change the schema and the whole order-line model.
- **Deletion**: soft delete (`isArchived`) only, or hard delete when there are no orders?
