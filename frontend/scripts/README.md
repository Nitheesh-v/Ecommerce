# Storefront preview without a database

The storefront renders from the **public** API only, so it can be reviewed without
MongoDB or the NestJS app — but it still needs *some* API answering. This is that:
a fixture server and six product photos, used for design review and screenshots.

```bash
cd frontend

# terminal 1 — fixtures on :5000 (the API origin next.config.ts already allows)
node scripts/demo-api.mjs

# terminal 2
NEXT_PUBLIC_API_URL=http://localhost:5000/api npm run dev
```

Then open <http://localhost:3000>.

## What it serves

`GET /api/{products, products/facets, products/:slug, products/:slug/reviews,
products/:slug/reviews/summary, categories, categories/:slug, store/settings,
offers/active, health}` — each returning the **same envelope and field names** as
the real API (`src/types/*`), plus `/uploads/<file>` for the images in
`public/demo/`.

`/uploads/*` rather than `/demo/*` on purpose: that is the one path
`next.config.ts` allow-lists for `next/image`, so the preview exercises the real
image pipeline instead of bypassing it.

## The guest journey

The one write path it does implement is the **guest cart and guest checkout**, in
memory, because that feature's whole value is a journey with no account in it — it
cannot be reviewed against static fixtures at all. It follows the live contract
exactly:

| Route | Notes |
| --- | --- |
| `GET /api/cart`, `POST /api/cart/items`, `PATCH|DELETE /api/cart/items/:id`, `DELETE /api/cart` | Owner comes from `x-cart-id` (or any `Authorization` header, which maps to one demo account). No identity → `401`, like the real guard. |
| `POST /api/checkout/preview`, `POST /api/checkout/place` | Requires `guestAddress`; `place` also needs `guestEmail`. Every amount is computed here from the catalogue and `SETTINGS`, never accepted from the client. The cart is emptied on place, as the real checkout does. |
| `GET /api/orders/guest` | The lookup the confirmation page uses: order number **and** email must match. |
| `POST /api/cart/merge` | Retires the guest cart; there is only one demo account, so nothing is unioned. |
| `POST /api/cart/coupon` | Deliberately `400`: coupons need the coupon module. Better a plain refusal than a fake discount. |

Carts and orders live in a `Map`, so **restarting the server empties them**. That is
correct for a demo with no database.

## What it does not do

No auth, no admin, no real coupons. Those flows have their own tests
(`cd ../backend && npm run test:e2e`) and run against the real API; a fixture that
half-implemented them would be a second, wrong specification.

Nothing here ships: `scripts/` and `public/demo/` are preview-only and are never
imported by application code.
