# Phase 13 — Offers, Coupons & Discount Management

_The brief called this "Phase 10 – Offers, Coupons & Discount Management"; the
repository's own numbering puts it after shipping, hence phase 13._

Single-vendor coupon engine: an admin console for offers, server-side discount
pricing shared with checkout, a race-free usage ledger, and a customer offers page.

No cart or checkout *page* was built in this phase (per decision): the API, the
reusable `<CouponField>` and `/offers` shipped, and the discount is applied by
`POST /api/orders` exactly as a real checkout would.

---

## 1. Scope decisions

| Question | Decision |
| --- | --- |
| Surfaces | `POST /api/coupons/validate` + reusable `CouponField` + `/offers`. No cart/checkout page. |
| Discount types | Percentage, fixed amount, **and** free shipping. No code-less promotions. |
| Stacking | One coupon per order. |
| Redemption timing | Reserve at checkout → finalise when the order becomes `confirmed` → reverse on `cancelled` **or** `returned`. |
| Historical orders | `order.couponCode` / `order.couponDiscount` are written once at creation and never recomputed. |

## 2. Date model

| Collection | Purpose | Key indexes |
| --- | --- | --- |
| `offers` | Coupon definition: code, type, value, window, limits, eligibility, visibility, audit `history` | unique `code`; `(isActive, startsAt, endsAt)`; `(customerVisible, isActive)`; `createdAt` |
| `coupon_redemptions` | One row per coupon use, driven by the order lifecycle | unique `(offerId, orderId)` (partial, only once an order is attached); `(status, redeemedAt)` |
| `coupon_customer_usage` | Per-customer counters keyed `offerId:customerKey` | unique `key` |

`customerKey` is the user id for a signed-in customer, otherwise `email:<lowercased>`.
Codes are stored upper-cased and matched case-insensitively, so `diwali10` and
`DIWALI10` are the same offer.

Offer **status is derived, never stored**: `active | scheduled | expired | exhausted | inactive`
from `isActive`, the window and the counters. There is no cron job and no flag that
can drift out of sync; the same derivation is mirrored in Mongo queries
(`statusFilter()`) so filters and badges agree.

## 3. Pricing (one formula, no duplication)

```
evaluateOffer(offer, lines)  →  { eligibleSubtotal, discount, freeShipping, reason }
computeTotals(lines, config, couponDiscount, { freeShipping })  →  subtotal / discount / shipping / tax / total
```

* `evaluateOffer` (`coupons/discount.ts`) is pure: it filters lines by
  include/exclude product and category rules, checks the minimum cart value against
  the **eligible** goods only, applies the percentage (floored, capped) or fixed
  amount (clamped to the eligible goods), or flags free shipping.
* `computeTotals` (`orders/pricing.ts`) is still the only place a total is produced.
  Its new `freeShipping` option waives the shipping charge; nothing else changed.
* The browser never sends an amount. `POST /api/coupons/validate` accepts
  `{ code, items: [{ productId, quantity }] }`, re-prices the products from the
  catalogue, and returns the discount breakdown. Order creation re-quotes and
  re-reserves inside the same request.

## 4. Redemption lifecycle

```
POST /api/orders ──► quote (preview, no writes)
                 ──► reserve stock ──► reserveUsage(offer, customerKey)   ← atomic, guarded
                 ──► write order (couponCode + couponDiscount snapshot)
                 ──► attach reservation → { orderId, orderNumber }
      failure    ──► release(reservationId)

order status ──► confirmed  → confirm redemption (reserved → redeemed)
             ──► cancelled  → reverse (released counter, status reversed)
             ──► returned   → reverse (same path, via the return workflow)
```

Guards that make replays harmless:

* `reserveUsage` is a single guarded `findOneAndUpdate` — the counter only moves
  while the offer is active, inside its window, and under both limits.
* The per-customer counter uses a unique `key`, so two simultaneous checkouts by
  the same customer cannot both pass.
* `coupon_redemptions` has a unique `(offerId, orderId)`, so a retried or duplicated
  request cannot write a second redemption.
* `confirm()` only moves `reserved → redeemed`; `reverse()` only closes a live
  redemption and returns the previous status, so a duplicate order event is a no-op.
* A checkout replay returning the same idempotency key returns the original order
  and leaves the ledger untouched.

Orders publish status changes from one choke point (`applyOrConflict`), including
shipment-driven promotions, so the coupon listener sees every transition exactly
once.

## 5. APIs

| Method | Route | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/admin/offers` | admin | search, status, type, date window, sort, pagination |
| `GET` | `/api/admin/offers/summary` | admin | stat cards + total redemptions + total discount given |
| `POST` | `/api/admin/offers` | admin | create (unique code, full config validation, history entry) |
| `GET` | `/api/admin/offers/:id` | admin | detail + audit history + confirmed redemptions/discount |
| `PATCH` | `/api/admin/offers/:id` | admin | edit; the merged result is re-validated |
| `DELETE` | `/api/admin/offers/:id` | admin | archive (hidden, deactivated, history kept) |
| `PATCH` | `/api/admin/offers/:id/status` | admin | pause / resume |
| `GET` | `/api/admin/offers/:id/redemptions` | admin | ledger for one offer |
| `GET` | `/api/admin/redemptions` | admin | search, status, offer, date range, sort, pagination |
| `GET` | `/api/admin/redemptions/export` | admin | CSV (5 000 row cap) |
| `POST` | `/api/coupons/validate` | public, throttled 20/min | server-priced preview |
| `GET` | `/api/offers/active` | public | customer projection (no internal settings) |

## 6. Validation rules

Create and edit share one validator, so an edit can never leave an offer in a state
a create would reject:

* code 3–32 characters, letters/digits/hyphen/underscore, unique case-insensitively;
* percentage 1–100 (whole number), fixed > 0, free shipping exactly 0;
* `maxDiscount` only on a percentage offer, and > 0;
* start strictly before expiry;
* `totalUsageLimit ≥ 1` when set, `perCustomerLimit ≥ 1`, and per-customer ≤ total;
* a product or category cannot appear in both the included and the excluded list;
* the DTO whitelist rejects unknown fields (`forbidNonWhitelisted`), so a client
  cannot post `couponDiscount` or `total`.

At validation/checkout time the API checks existence (unknown and archived codes
share one message), active state, window, minimum cart value, eligible items,
exclusions, exhaustion, per-customer usage, and whether the code is already on an
order for that customer.

## 7. Admin UI

| Route | Screen |
| --- | --- |
| `/admin/offers` | Six stat cards (total, active, scheduled, expired, redemptions, discount given), search, status/type/date filters, sortable table (name, code, discount, value, start, expiry, usage, status, actions), pagination, pause/resume and archive with confirmation |
| `/admin/offers/create` | Full form: details, discount, schedule/limits, eligibility pickers (products + categories, included + excluded), visibility |
| `/admin/offers/[id]/edit` | Same form pre-filled, plus the audit trail |
| `/admin/offers/redemptions` | Ledger: code, customer, order link, discount, date, status, search/status/date filters, CSV export |
| `/admin/offers/[id]/redemptions` | The same ledger pinned to one offer |

Components live in `src/components/admin/offers/`; the list and ledger are backed by
`use-offer-list.ts` and `use-redemption-list.ts` (debounced search, abortable
requests, loading/error/empty states). The nav item "Coupons" is now enabled and
points at `/admin/offers`.

## 8. Customer surface

* `/offers` lists active, customer-visible offers: code, discount label, minimum
  spend, cap, expiry, and the qualifying products/categories. Lifetime counts,
  limits, the on/off switch and the audit trail are not in the public projection.
* `<CouponField lines={[...]}>` (`src/components/store/coupon-field.tsx`) is the
  reusable apply/remove control built on `useCouponPreview`. It renders the
  server-returned subtotal/discount/shipping/tax/total and is mounted on the
  product page as a live preview; the future cart/checkout page can drop it in
  unchanged.

## 9. Security & abuse protection

* All mutations are admin-only (`@Roles(Role.Admin)` + `RolesGuard`); e2e asserts
  401 for anonymous and 403 for a customer on every admin route.
* No client amount is trusted: totals are computed server-side from the catalogue,
  and the DTO whitelist rejects discount fields posted by a client.
* `POST /coupons/validate` is throttled to 20 requests/minute; unknown and archived
  codes return the same message to frustrate enumeration.
* Every mutation appends to the offer's `history` with the acting admin's email,
  visible on the edit screen and exportable via the redemption ledger.

## 10. Tests & results

Backend `npm run verify`:

| Check | Result |
| --- | --- |
| Type check | pass |
| Lint | pass |
| Unit tests | **192 passed** (12 new: discount maths + status derivation) |
| E2E tests | **268 passed** (27 new in `test/coupons.e2e-spec.ts`) |
| Production build | pass |

New e2e coverage: admin authorization, create/edit/archive and duplicate codes,
invalid configurations, list filters and counts, percentage/fixed/free-shipping
pricing, expired/scheduled/inactive/exhausted codes, minimum spend, product and
category restrictions, per-customer and total limits, a concurrent race for the
last use, checkout totals and the discount snapshot, reservation → confirmation →
cancellation → return reversal, checkout replay idempotency, the redemption ledger
and CSV export, and the public projection.

Frontend: `npm run typecheck`, `npm run lint`, `npm run build` all pass
(`/offers` prerendered, admin offer routes present).

## 11. Configuration & follow-ups

* Nothing new to configure — coupons use the existing pricing config
  (`freeShippingThreshold`, `taxRate`, `shippingCharge`, `currency`).
* No database migration is required: the three collections are created on first use
  and their indexes are declared on the schemas.
* Not in this phase (deliberately): a cart/checkout page, automatic code-less
  promotions, coupon stacking, and per-offer analytics beyond the two totals on the
  stat cards.
* The coupon listener runs in-process with the order writes; if the app is ever split
  into multiple services, the order event bus is the seam to move to a queue.
