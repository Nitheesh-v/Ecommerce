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

## What it does not do

No writes, no auth, no cart, no checkout, no admin. Those flows have their own
tests (`cd ../backend && npm run test:e2e`) and run against the real API; a
fixture that half-implemented them would be a second, wrong specification.

Nothing here ships: `scripts/` and `public/demo/` are preview-only and are never
imported by application code.
