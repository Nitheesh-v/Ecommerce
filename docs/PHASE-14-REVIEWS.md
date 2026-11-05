# Phase 14 — Reviews & Ratings

Verified-buyer reviews with a moderation queue: nothing reaches the storefront until
an admin publishes it, and every review is backed by a delivered order.

---

## 1. Scope decisions

| Question | Decision |
| --- | --- |
| Who may review | **Verified buyers only** — a customer whose order containing the product reached `delivered` |
| Publication | **Pending → approved / rejected.** The storefront reads approved rows only |
| Content | 1–5 stars, optional headline, required comment (10–2 000 characters). No photos, no helpful votes, no admin replies |
| Duplicates | One review per customer per product, enforced by a unique index |

## 2. Data model

`reviews` — one document per review:

| Field | Notes |
| --- | --- |
| `productId`, `userId` | References; together they carry the unique index |
| `customerName`, `customerEmail` | Name taken from the delivered order's address, not guessed from the email |
| `orderId`, `orderNumber` | The delivered order that proves the purchase — kept so the claim can be re-checked |
| `rating` | Integer 1–5 |
| `title`, `comment` | Headline optional; comment required |
| `status` | `pending` on create; only moderation changes it |
| `moderatedBy`, `moderatedAt`, `moderationReason` | Who decided, when, and why (required for a rejection) |

Indexes: unique `(productId, userId)`; `(productId, status, createdAt)` for the
product page; `(status, createdAt)` for the queue; `(userId, createdAt)` for
"my reviews".

## 3. Eligibility

`findDeliveredPurchase(userId, productId)` asks the orders module for that customer's
delivered orders (bounded to 100, indexed by `userId` + `status`) and looks for the
product in their item snapshots. Nothing is inferred from a cart, a wishlist or a
`deliveredAt` field that could drift — the order status is the only evidence accepted.

Consequences: a review is refused with `403` when the product was never delivered to
that customer, `409` when they already reviewed it, and `404` when the product is not
published (drafts are not reviewable).

## 4. Moderation

| Action | Route | Rules |
| --- | --- | --- |
| Approve | `PATCH /api/admin/reviews/:id` `{status:"approved"}` | Publishes to the storefront |
| Reject | `PATCH …` `{status:"rejected", reason}` | Reason required (`400` without one) and stored |
| Change a decision | `PATCH …` with the other status | Allowed (a published review can be pulled) |
| Repeat the same decision | `PATCH …` | `409` — the update is guarded on `status != target`, so a double click changes nothing |
| Delete | `DELETE /api/admin/reviews/:id` | Permanent; `404` afterwards |

Counting is always over approved rows: the average, the star distribution and the
"review count" on the product page exclude pending and rejected reviews.

## 5. APIs

| Method | Route | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/products/:idOrSlug/reviews` | public | Approved only; `rating`, `sortBy`, `sortOrder`, pagination |
| `GET` | `/api/products/:idOrSlug/reviews/summary` | public | Average, count, 5→1 distribution |
| `GET` | `/api/products/:idOrSlug/reviews/eligibility` | signed in | Can this customer review it, and what state is their existing review in |
| `POST` | `/api/products/:idOrSlug/reviews` | signed in | Verified buyers only; always stored `pending` |
| `GET` | `/api/reviews/mine` | signed in | The customer's own reviews with their status |
| `GET` | `/api/admin/reviews` | admin | search, status, product, rating, dates, sort, pagination |
| `GET` | `/api/admin/reviews/summary` | admin | Queue counts + approved average |
| `GET` / `PATCH` / `DELETE` | `/api/admin/reviews/:id` | admin | Read, moderate, delete |

## 6. Validation & security

* The create DTO carries **only** `rating`, `title`, `comment`. `forbidNonWhitelisted`
  turns any attempt to post `status`, `customerEmail` or `orderId` into a `400`
  (asserted in e2e), so a customer cannot publish or impersonate.
* The customer identity, the verifying order and the starting status are all set by
  the server.
* The public projection masks the author (`Asha R.`) and omits the email, the order
  reference and all moderation metadata; e2e asserts those strings never appear in
  the payload.
* Every admin route is `@Roles(Role.Admin)`; anonymous `401` and customer `403` are
  covered by tests.
* Spam is bounded by three layers: the global rate limiter, one-review-per-product
  per customer, and moderation — an unpublished review is invisible.

## 7. Admin console (`/admin/reviews`)

Star rating badge, review title + body (with any rejection reason), product link,
customer name/email, submitted date and order number, status, and row actions:

* five cards — total, awaiting moderation, published, rejected, average rating;
* search across customer, order number and review text;
* status, star-rating and date filters; sortable rating/date/status; pagination;
* approve / reject (dialog requiring a reason) / delete (separate confirmation);
* loading skeletons, empty states for "no reviews" vs "no matches", error retry.

The "Reviews" sidebar item is now enabled.

## 8. Storefront

The product page gained a **Ratings & reviews** block: the API-computed average,
the 5→1 distribution bars, the six most recent approved reviews (masked author,
"Verified purchase"), and a review form.

The form's state comes from `GET …/reviews/eligibility`, so a signed-out visitor is
told to sign in, a customer who never received the product is told why, and someone
who already reviewed sees that their review is awaiting moderation. Eligibility is a
courtesy: the submit endpoint re-checks the order, so bypassing the UI buys nothing.

## 9. Tests & results

Backend `npm run verify`:

| Check | Result |
| --- | --- |
| Type check | pass |
| Lint | pass |
| Unit tests | 192 passed |
| E2E tests | **286 passed** (18 new in `test/reviews.e2e-spec.ts`) |
| Production build | pass |

New e2e coverage: anonymous read vs anonymous write, customer blocked from the admin
console, review refused without a delivered order, refused when the delivered order
held a different product, accepted after delivery (stored `pending`, invisible
publicly), duplicate blocked, server-owned fields rejected by the whitelist,
unpublished products not reviewable, approval publishing the review with masked
author and no email/order leakage, rejection requiring a reason and hiding the
review, repeated decisions rejected with `409`, delete + `404`, average/distribution
computed over approved rows only, a null average with no reviews, rating filter and
pagination, "my reviews" scoping, and the admin queue's status/rating/product/search
filters.

Frontend: `npm run typecheck`, `npm run lint`, `npm run build` all pass
(`/admin/reviews` prerendered).

## 10. Configuration & follow-ups

* Nothing to configure — no new environment variables, no migration. The `reviews`
  collection is created on first write and its indexes are declared on the schema.
* Review photos, helpful votes, admin replies and per-product rating sort/filter on
  the storefront were explicitly out of scope.
* Ratings are cached with the rest of the catalogue (`reviews` cache tag, minutes),
  so a newly approved review appears within that window rather than instantly.
* If the catalogue ever grows large, `findDeliveredPurchase` should move to a
  dedicated "purchased products" read model instead of scanning a page of orders.
