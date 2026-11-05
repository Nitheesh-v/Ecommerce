# Phase 16 — Storefront home, customer accounts & catalogue browsing

The storefront had a header, a category grid and product pages — enough to prove the
public API worked, not enough to shop with. This phase makes it a marketplace: a real
landing page, shopper sign-in/sign-up with an account area, and a Flipkart-shaped
browse page with working filters, sorting and paging.

Two backend additions were needed before any of that could be honest: **ratings had
to be readable per product** (for stars on cards and a "highest rated" sort) and the
**catalogue needed filter values** (so the sidebar counts are real, not invented).

---

## 1. Backend: ratings on the product document

Reviews were computed on demand by the reviews module, so a product card had no
average to show and "sort by rating" was impossible without an aggregate per row.

- `products` gained `ratingAverage` (0–5, one decimal) and `ratingCount`.
- `ReviewsService` recomputes both from `counts({ productId })` — the same function
  the review summary endpoint uses — and writes them through
  `ProductsService.syncRating()` after **approve**, **reject** and **delete**.
  Pending reviews never move the number.
- The public product projection exposes both fields; `costPrice` still never appears.

The reviews endpoints remain the authority. The product fields are a cache of their
answer, written on exactly one path, so the two cannot drift apart silently — a test
asserts the card equals the summary after each moderation action.

## 2. Backend: storefront filters and facets

`GET /api/products` gained filter parameters, all applied server-side:

| Parameter | Meaning |
| --- | --- |
| `minPrice`, `maxPrice` | band on the **effective** price (sale price counts), minor units |
| `inStock` | only products with stock |
| `onSale` | only products whose sale price is below the list price |
| `minRating` | at least this approved-review rating |
| `sortBy=rating` | highest rated first, ties broken by rating count |

Price and sale comparisons run as `$expr` against `$ifNull: ['$salePrice', '$price']`,
because a sale price is what the customer actually pays.

New `GET /api/products/facets` returns the sidebar's values: per-category counts with
each category's price bounds, the catalogue's price range, `4★+`/`3★+` buckets, and
in-stock/on-sale totals. It is computed over **everything published**, deliberately
not narrowed by the current query — a filter that disappears as you use it is a trap.
Category slugs and names are resolved in the service so the client never joins.

`/products/facets` is declared **before** `/products/:idOrSlug`, otherwise "facets"
would be read as a slug.

## 3. Storefront home

`/` is now a marketplace landing page, all of it server-rendered from cached reads:

1. **Hero** — store name (from the settings document), a working search form, and
   three trust cards.
2. **Category strip** — top categories as circular tiles, linked to their pages.
3. **Deals of the day** — `onSale=true`, cheapest first, with `% OFF` badges.
4. **Top rated** — `sortBy=rating`, stars on every card.
5. **New arrivals** — newest published products.
6. **Handpicked** — featured products (omitted when empty).
7. **Payment/support band** — cash-on-delivery state and contact details read from
   `GET /api/store/settings`, so the page stops promising COD the moment an admin
   turns it off.

When nothing is published the page says so and links to the admin console — it does
not invent a catalogue.

## 4. Shopper accounts

- `/login` and `/register` — react-hook-form + zod, the same validation rules the API
  enforces (8–72 characters, a letter and a number), with `next` preserved through
  both directions so a customer returns to what they were doing.
- `useCustomerAuthStore` is a **separate** Zustand store from the admin one: the admin
  store refuses non-admin accounts, and a storefront must not carry that rule. Both
  write to the same in-memory `session`, because one browser has one session.
- The access token never touches storage. A reload is recovered from the HttpOnly
  refresh cookie by `bootstrap()`, which the header's account control runs on mount.
- `/account` — profile summary, member since, links to orders/offers/shop.
- `/account/orders` — the customer's own orders with totals, statuses, a tracking
  link, and a "complete payment" link for unpaid online orders.
- `RequireCustomer` gates those screens (skeleton while the cookie is checked, then a
  sign-in prompt with `next`). The API stays the authority: every order read is
  scoped to the caller, and someone else's order is a `404`.

The header gained a search form (a plain `GET /products` form — it works without
JavaScript and keeps the query in the URL) and the account control. The footer now
links to the real account/orders/offers pages instead of describing them.

## 5. Catalogue browse (`/products`)

Filters, sorting and paging all live in the URL and are resolved on the server:

- **Sidebar** — categories with counts, price bands derived from the catalogue's real
  bounds plus custom min/max, `4★ & above` / `3★ & above` with counts, in-stock and
  on-sale toggles, each removable and all clearable.
- **Sort** — newest, price ascending/descending, customer rating, name.
- **Chips** — one per active filter, each removable, plus "clear all".
- **Grid & paging** — link-based pagination (`?page=2`), so pages are shareable and
  crawlable; a filter change resets to page 1, because staying on page 4 of a filter
  you just narrowed is how a catalogue shows an empty screen.
- **Mobile** — the sidebar collapses into a disclosure with a filter count.
- Empty and degraded states are explicit: no matches suggests removing a filter, and
  an unreachable facets endpoint says filters are unavailable instead of rendering a
  blank column.

Product cards now show the discount percentage, the effective price, the struck-through
list price, and a rating pill (`4.6 ★ (12)`) or "No ratings yet".

### Two Next.js constraints worth recording

- `/products` reads `searchParams`, so it sets `export const instant = false` — the
  same trade the admin console makes. The page *is* the query.
- The account control uses `usePathname`/`useRouter`, which are dynamic. It is wrapped
  in `<Suspense>` inside the header, so the rest of the header stays in the static
  shell and only that subtree renders at request time.

## 6. Verification

| Suite | Result |
| --- | --- |
| Backend `npm run verify` | typecheck, lint, **204 unit**, **309 e2e**, production build — green |
| `test/products.e2e-spec.ts` | 36 (was 32): price band on the effective price, sale/stock/rating filters, rating sort + card fields, facets |
| `test/reviews.e2e-spec.ts` | 20 (was 18): card rating follows approval, and drops back on delete |
| Frontend | typecheck, lint, build — green; `/login`, `/register` prerendered, `/products` dynamic, home page static |

## 7. Deliberately not built

- **Cart and checkout UI.** This is the next phase, and it was scoped separately
  (server-side cart, sign-in required). Nothing here fakes a cart: there is no cart
  button that goes nowhere.
- **Wishlist / save for later** — no endpoint exists, and a heart that does nothing is
  worse than no heart.
- Guest checkout, product variants (size/colour), and faceted search beyond the
  filters above (brand, size, colour) — all still open.
- Personalised recommendations: the rails are honest signals (on sale, rating, recency,
  featured), not a model.
