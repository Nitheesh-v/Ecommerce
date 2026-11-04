# Phase 10 — Customer Management

> Requested as "Phase 6 — Customer Management". In this repository the modules shipped so far are
> numbered 1–9 (inventory was 8, orders 9), so this report continues that sequence as **Phase 10**.
>
> Status: **implemented and verified.** A customer is still a `users` document — no second customer
> collection was created. Spending and order figures are derived from `orders`, account states are
> audited, and suspending someone takes effect immediately without touching a single order.

---

## 1. Inspection findings

Read before writing code.

| Found | Where | Consequence for this phase |
| --- | --- | --- |
| A customer **is** a `users` document: `email` (unique), `passwordHash` (`select: false`), `firstName`, `lastName?`, `role: customer\|admin`, `isActive`, timestamps | `backend/src/modules/users/schemas/user.schema.ts` | Extended in place. No `customers` collection, no duplicated identity. |
| No `phone`, no `avatarUrl`, no status enum, no address book | same | Added as **optional** fields + a status machine. Addresses are derived from order snapshots rather than collected again. |
| `isActive` is checked at **login** and **refresh** (refresh also revokes every session) | `users.service.ts`, `auth/services/auth.service.ts` | Kept as a derived mirror of `status === 'active'`, so all existing auth behaviour stays intact. |
| `JwtAuthGuard` is **stateless** — it verifies the token and never reads the user | `auth/guards/jwt-auth.guard.ts` | A suspended customer's live access token would have kept working. Added an opt-in guard for the routes that matter. |
| `SessionsRepository.revokeAllForUser()` already exists | `auth/repositories/sessions.repository.ts` | Suspension/deactivation revokes every device immediately. |
| `PublicUser` + `toPublicUser` already strip the hash; `passwordHash` is `select: false`; refresh tokens are stored only as SHA-256 hashes | users/auth modules | Sensitive-field protection is structural; the new endpoints add their own projection and never join `sessions`. |
| Orders store `customerName`, `customerEmail`, `customerPhone`, the full `shippingAddress` snapshot, `payment.paidAmount`, `payment.refunds[]`, `status`, `paymentStatus`, and the order list already filters by `userId` | `orders/...` | Order history, addresses and every spending figure come from orders. Nothing is re-declared. |
| Dashboard "revenue" was `paymentStatus: 'paid'` **and** `status ∉ {cancelled, returned}`, summing `total` — refunds ignored | `admin/repositories/mongo-dashboard.repository.ts` | Extracted one shared definition (`orders/spending.ts`) and pointed both the dashboard and the customer module at it. |
| Console conventions: `PaginationQueryDto` (limit ≤ 100), `createPaginatedResult`, `@Roles(Role.Admin)`, `@SkipResponseEnvelope`, `AllExceptionsFilter` | `common/*` | Every new endpoint follows them exactly. |
| Frontend had no customer types/service/hooks/pages; the sidebar entry was `Soon` | `frontend/src` | Built the console slice with the existing UI kit; nav flipped. |

---

## 2. Backend

### 2.1 Files

```
backend/src/modules/users/
├── customer-status.ts                        # status enum, transitions, legacy resolver
├── schemas/user.schema.ts                    # + phone, avatarUrl, status, statusHistory, index
├── repositories/users.repository.ts          # + phone/status/history, updateStatus, setPhoneIfMissing
├── repositories/mongoose-users.repository.ts # guarded, atomic status write
└── users.service.ts                          # + assertUsable, rememberPhone, changeStatus

backend/src/modules/customers/
├── customers.module.ts
├── admin-customers.controller.ts             # /api/admin/customers  @Roles(Role.Admin)
├── customers.service.ts                      # list, detail, summary, analytics, orders, status, CSV
├── customers.service.spec.ts                 # 19 unit tests
├── dto/customers-query.dto.ts
├── dto/update-customer-status.dto.ts
└── repositories/
    ├── customers.repository.ts               # read-model contract + view types
    └── mongo-customers.repository.ts         # users ⨝ orders aggregation

backend/src/modules/orders/
├── spending.ts                               # the single spending/revenue definition
└── orders.service.ts                         # + listForUser(), phone sync on checkout

backend/src/modules/auth/guards/active-account.guard.ts   # blocks suspended accounts

backend/src/common/utils/regex.util.ts (+ spec)           # escaped search for every LIKE-style query
```

Supporting changes:

| File | Change |
| --- | --- |
| `app.module.ts` | registers `CustomersModule` |
| `orders/orders.module.ts` | imports `UsersModule`, provides `ActiveAccountGuard` |
| `orders/orders.controller.ts` | `@UseGuards(ActiveAccountGuard)` on customer order routes |
| `admin/repositories/mongo-dashboard.repository.ts` | revenue now uses the shared spending match + net-spend expression |
| `auth/dto/register.dto.ts` | optional `phone` (validated, trimmed) |
| `test/support/in-memory-users.repository.ts` | status/history + `updateStatus`, `setPhoneIfMissing`, `all()`, `forceStatus()` |
| `test/support/in-memory-customers.repository.ts` | new fake over the *same* users + orders fakes |
| `test/support/create-test-app.ts` | `customers?` repository override |
| `test/customers.e2e-spec.ts` | 22 end-to-end tests |

### 2.2 Endpoints

All under `/api/admin/customers`, `@Roles(Role.Admin)` (401 anonymous, 403 customer):

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | List — `search` (name/email/phone), `status`, `from`/`to` (registration), `minSpent`/`maxSpent`, `hasOrders`, `sortBy=createdAt\|netSpent\|name`, `sortOrder`, `page`, `limit` |
| `GET` | `/summary` | Analytics: totals, new this month, active/suspended/deactivated, repeat buyers, average spend, net revenue |
| `GET` | `/export` | CSV of the filtered set (`text/csv`, attachment, 5 000 row ceiling) |
| `GET` | `/:id` | Profile + metrics + addresses + activity + status history |
| `GET` | `/:id/orders` | Order history (paginated, sorted by the order module) |
| `GET` | `/:id/summary` | Metrics only |
| `PATCH` | `/:id/status` | `active` / `suspended` / `deactivated`, with `reason` + `note` |

### 2.3 Schema changes (`users`)

| Field | Type | Notes |
| --- | --- | --- |
| `phone` | `string?` (≤ 20) | Optional; supplied at registration or learned at checkout. Never overwritten once set. |
| `avatarUrl` | `string?` | Reserved for a customer-facing profile UI; the console falls back to initials. |
| `status` | `active \| suspended \| deactivated` | Defaults to `active`; indexed (`{ status, createdAt }`). |
| `statusHistory[]` | append-only `{ from, to, reason, note, by{userId,email}, at }` | Written in the same atomic update as the status. |
| `isActive` | boolean (existing) | **Derived mirror** of `status === 'active'`, kept for the existing auth/session checks. |

Legacy documents (created before this phase) have no `status`; the repository resolves them with
`resolveStatus()` → `isActive === false ? 'deactivated' : 'active'`, so nothing disappears from the
console before a backfill runs.

### 2.4 Status machine

```
active ──suspend──→ suspended ──reactivate──→ active
   │                    │
   └──deactivate────────┴──→ deactivated ──reactivate──→ active
```

| Rule | Behaviour |
| --- | --- |
| Same status | `400` ("already suspended" …) |
| Illegal target (e.g. `deactivated → suspended`) | `400` naming the current state |
| Concurrent change | guarded `findOneAndUpdate({ _id, status: expected })` → `409` instead of overwriting a newer decision |
| Every change | `{ from, to, reason, note, by, at }` appended; the acting admin is recorded |
| Suspend / deactivate | all refresh sessions revoked |
| Active token after suspension | customer order routes answer `403` via `ActiveAccountGuard` |
| Orders, payments, invoices | **never touched** — history belongs to the business |

Admins are deliberately out of scope: the read model matches `role: 'customer'`, so an admin id
answers `404` rather than allowing one admin to suspend another through this module.

### 2.5 Spending & analytics definition

One definition, in `orders/spending.ts`, used by the list, detail, analytics, CSV **and** the admin
dashboard:

```
counted order  = payment.paidAmount > 0  AND  status ∉ {cancelled, returned}
net spend      = max(0, paidAmount − Σ processed refunds)
```

- Never-paid / failed / pending orders contribute **0**.
- Cancelled and returned orders contribute **0** even if money was once collected.
- **Pending** refunds are reported separately (`pendingRefundAmount`) and are *not* subtracted — the
  money has not left the account yet.
- `successfulOrders` = counted orders; `averageOrderValue = netSpend / successfulOrders`.
- Repeat customer = `successfulOrders ≥ 2`; average spend = `netSpend ÷ customers with ≥ 1 purchase`.

The dashboard's revenue, revenue series and average order value now use the same rule, so the two
screens can no longer disagree. (Category/top-product breakdowns remain line-level gross for counted
orders — a refund is not attributable to individual lines in the current model.)

### 2.6 The join (no N+1)

`MongoCustomersRepository` runs **one** aggregation per request:

```
users (role: customer, filters)
  → $lookup orders (per customer, with per-order net spend + "counted" flag)
  → $addFields  totalOrders, successfulOrders, netSpent, refunded, pendingRefund, first/last order
  → $match      spending range / hasOrders          ← filtering happens *after* the metrics
  → $sort       createdAt | netSpent | name
  → $facet      { items: page, meta: count }
```

Filtering and sorting by spending therefore stay correct across pages instead of being applied to
whatever rows happened to load. Aggregation pipelines and the in-memory fake share the same helper
functions (`isSuccessfulPurchase`, `orderNetSpent`, …), so the JS and Mongo implementations cannot
drift silently.

### 2.7 CSV export

`GET /api/admin/customers/export` streams `text/csv` as an attachment with the same filters as the
table (no pagination), capped at **5 000 rows** and 13 allow-listed columns (id, names, email, phone,
status, registration, order counts, net spend, refunds, last order). No hashes, tokens or free-form
internals. Amounts are emitted as plain decimals (₹) so a spreadsheet reads them correctly.

---

## 3. Frontend — admin console

| File | Purpose |
| --- | --- |
| `src/types/customer.ts` | Customer, detail, metrics, addresses, activity, overview, query, label + transition maps |
| `src/services/admin/customers.service.ts` | `list`, `get`, `summary`, `analytics`, `orders`, `updateStatus`, `exportCsv` (API-generated download) |
| `src/hooks/use-customer-list.ts` | Server-paginated list (debounced search, abortable, query-key loading), analytics hook, detail hook |
| `components/admin/customers/customers-view.tsx` | Page: analytics cards, filters, table, pagination, CSV export, empty/error states |
| `…/customer-summary-cards.tsx` | Six metric cards (total, new this month, active, repeat, average spend, net revenue) |
| `…/customers-filters.tsx` | Name/email/phone search, status, registration range, spend range, “has purchased”, sort |
| `…/customers-table.tsx` | Avatar + name/email + short id, phone, registered, orders, successful, spending (with refunds), last order, status badge, view action; sortable name/date/spend |
| `…/customer-detail-view.tsx` | Profile, order summary, order history, addresses, activity, status history |
| `…/customer-orders-table.tsx` | Paginated order history reusing the order status badges |
| `…/customer-status-dialog.tsx` | Status change with only legal targets, consequence copy, reason + note, confirmation |
| `…/customer-badges.tsx` | Status badge + initials avatar (image when an avatar exists) |
| `app/admin/(console)/customers/page.tsx` | `/admin/customers` |
| `app/admin/(console)/customers/[id]/page.tsx` | `/admin/customers/[id]` |

`nav-config.ts` flips **Customers** from “Soon” to an active item.

Behaviour worth calling out:

- **No client-side maths.** Spending, averages and counts come from the API; the table only formats.
- **Nothing optimistic.** After a status change the detail is re-read from the server.
- **Destructive actions explain themselves** (sign-out on all devices, orders preserved).
- **CSV = what you see:** the export reuses the active filters.

---

## 4. Verification

Backend (`cd backend`):

```
npm run verify
```

```
✓ Type check........ 3.0s
✓ Lint.............. 0.2s
✓ Unit tests........ 4.8s
✓ E2E tests......... 15.9s
✓ Production build.. 8.2s
All checks passed.
```

| Suite | Result |
| --- | --- |
| Unit | **155 passed** / 14 files (132 before + 19 in `customers.service.spec.ts` + 4 for `escapeRegex`) |
| E2E | **179 passed** / 11 files, including `customers.e2e-spec.ts` **22 passed** |

Coverage against the brief:

| Requirement | Test |
| --- | --- |
| Customer listing | e2e list test + unit pagination test |
| Search by name / email / phone | unit + e2e (phone falls back to the latest order) |
| Filter by registration date | unit + e2e |
| Filter by account status | unit + e2e |
| Sort by registration date / spending | unit + e2e |
| Server-side pagination | unit + e2e (`limit=1`, page 1 ≠ page 2) |
| Customer details | e2e profile + activity + addresses |
| Order history per customer | e2e (only that customer's orders) + unit (scoping through the order module) |
| Spending calculations (refunds, cancelled, failed) | unit + e2e — net of processed refunds, pending reported separately |
| Customers with no orders | unit + e2e |
| Account suspension / activation / deactivation | unit + e2e (history, admin recorded, sessions revoked, login blocked, order token blocked) |
| Suspended cannot order | e2e `403` on `POST /api/orders` with a pre-suspension token |
| Orders preserved on deactivation | e2e (order still in `/api/admin/orders`) |
| No-op / illegal transitions | unit + e2e |
| Unauthorized access | e2e 401 anonymous, 403 customer on every route |
| Sensitive field protection | e2e scans list/detail/orders payloads for `passwordHash`, `tokenHash`, `password`, `$2b$` |
| CSV export | unit (header, quoting, filters) + e2e (content-type, attachment, filters, 403/401) |
| Analytics | unit + e2e (counts, repeat buyers, average spend) |
| Admin accounts refused | e2e `404` when targeting the admin id |
| Invalid ids / filters | e2e `404` malformed id, `400` invalid sort/status/spend range |

Frontend (`cd frontend`):

```
npm run typecheck   → clean
npm run lint        → clean
npm run build       → 25 routes
/admin/customers             ○
/admin/customers/[id]        ◐
```

Production build served on port 3013 and smoke-tested: `/admin/customers`,
`/admin/customers/<id>`, `/admin/orders`, `/admin/products`, `/admin/dashboard` → all `200`. The
console is behind a client-side auth gate that renders a skeleton server-side, so HTTP smoke cannot
exercise populated tables; the data contract is covered by the backend e2e suite (no browser here).

---

## 5. Run it locally

```
cd backend && npm run start:dev      # http://localhost:5000/api
cd frontend && npm run dev           # http://localhost:3000
```

Then open `http://localhost:3000/admin/customers`:

1. the cards fill from `/api/admin/customers/summary`;
2. search by name/email/phone, filter by status or registration range, sort by spending;
3. open a customer → order summary, order history, addresses captured from orders, activity, status
   history;
4. **Change status** → only legal targets are offered, a reason is required, and the change is
   audited with your admin email;
5. **Export CSV** downloads exactly the filtered set.

---

## 6. Known issues & decisions

1. **No `customers` collection.** Identity, auth and account state live in `users`; behaviour lives in
   `orders`. A separate customer profile collection would have duplicated identity and needed syncing.
2. **Addresses are derived, not managed.** The profile shows distinct shipping addresses from order
   snapshots, newest first. A customer-managed address book (default address, billing address) needs a
   customer-facing account UI and is deferred to that slice.
3. **No avatar upload.** `avatarUrl` exists but nothing sets it yet; the console renders initials.
   Adding an uploader would reuse the existing image-storage module.
4. **Phone is learned, never guessed.** It is captured at registration or from checkout, and the
   console falls back to the most recent order's number when the account has none.
5. **Status changes are the only customer write.** Editing names/emails from the console is not
   offered — that is the customer's own data, and there is no support-flow for it yet.
6. **`ActiveAccountGuard` is opt-in**, currently on the customer order routes. Other future
   account-scoped controllers should add it; making it global would add one user lookup to every
   authenticated request.
7. **Pending refunds are not deducted** from spending (they are reported). A cancelled-but-not-yet-
   refunded order therefore still shows the money as collected — which is true.
8. **Money is gross at the line level** for category/top-product dashboards; refunds are netted only
   at order level, where they are actually recorded.
9. **CSV is capped at 5 000 rows** and generated on request (no background job, no signed URL).
10. **No frontend test runner**, so the console is verified by typecheck/lint/build/smoke plus the
    backend contract suite.

---

## 7. Completion report

**Files created** — backend: `users/customer-status.ts`, `customers/*` (module, controller, service,
2 DTOs, repository contract + Mongo implementation), `orders/spending.ts`,
`auth/guards/active-account.guard.ts`, `common/utils/regex.util.ts`; tests: `customers.service.spec.ts`,
`customers.e2e-spec.ts`, `in-memory-customers.repository.ts`, `regex.util.spec.ts`.
Frontend: `types/customer.ts`, `services/admin/customers.service.ts`,
`hooks/use-customer-list.ts`, 8 components under `components/admin/customers/`, 2 route files;
this document.

**Files modified** — `users/schemas/user.schema.ts`, users repository (contract + Mongoose),
`users.service.ts`, `auth/dto/register.dto.ts`, `orders/orders.service.ts`, `orders/orders.module.ts`,
`orders/orders.controller.ts`, `admin/repositories/mongo-dashboard.repository.ts`, `app.module.ts`,
`orders.service.spec.ts`, `in-memory-users.repository.ts`, `create-test-app.ts`;
frontend `nav-config.ts`; `README.md`, `docs/ARCHITECTURE.md`.

**APIs** — 7 admin endpoints under `/api/admin/customers` (list, summary, export, detail, orders,
per-customer summary, status).

**Database changes** — `users` gains `phone?`, `avatarUrl?`, `status` (+ index `{ status, createdAt }`)
and append-only `statusHistory[]`; `isActive` remains as a derived mirror. No new collection.

**Analytics logic** — one shared definition (`orders/spending.ts`): counted = money collected and the
sale not called off; net spend = `paidAmount − processedRefunds`; repeat = ≥ 2 counted orders; average
spend = net spend ÷ customers with a counted order. Dashboard revenue now uses the same rule.

**Security measures** — admin-only routes (401/403), customers are 404s through the read model,
guarded atomic status writes, audited history with the acting admin, session revocation on
suspend/deactivate, immediate blocking of order placement via `ActiveAccountGuard`, escaped search
input, `@SkipResponseEnvelope` CSV with a row ceiling, and response projections that never include
`passwordHash`, `tokenHash` or session data.

**Tests performed** — backend 155 unit + 179 e2e green (customers contributes 19 unit / 22 e2e);
frontend typecheck, lint and production build clean (25 routes) plus HTTP smoke on five console routes.

**Remaining issues** — see §6 (derived addresses, no avatar upload, opt-in active-account guard,
pending refunds reported not deducted, CSV cap, no browser tests).

**Next recommended phase** — **Payments** (`/admin/payments`): a transactions view over the refund
records and payment fields already modelled here and in orders, gateway integration (Razorpay) behind
the existing `PATCH /admin/orders/:id/payment` seam, and webhook verification. Per your instruction it
has **not** been started — Customer Management is complete and verified first.
