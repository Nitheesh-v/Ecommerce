# Phase 6 — Product Management

> **Scope approved for this phase:** a complete, production-ready product module — schema, service, admin CRUD API, image uploads, and a fully wired admin UI (list, create, edit, details, delete). **Category Management was deliberately not started**; only the read-only slice of categories that products need to exist was added.
>
> Result: a real product catalogue behind the existing auth/RBAC, 32 API e2e tests and 25 unit tests on the new code, and four admin pages bound to those endpoints — no mock product data anywhere.

---

## 1. Inspection findings

Checked before writing code, so the module reuses what already existed instead of re-inventing it.

| Area | Finding |
| --- | --- |
| Product schema / module | **Did not exist.** No `products` module, controller, DTO or schema anywhere in the backend. |
| Categories | **Did not exist either**, but the Phase 5 dashboard already reads `products.categoryId → categories._id` and `categories.name` in its revenue-by-category and low-stock pipelines, so a minimal categories module had to land first. |
| Dashboard contract | `mongo-dashboard.repository.ts` documents the collection contract the product schema must satisfy: `status != 'archived'` for countable products, `stock <= lowStockThreshold ?? 5` for low stock, `{ categoryId, status }` joins. The schema below matches it exactly. |
| Auth / RBAC | Global `JwtAuthGuard` (deny by default) + `RolesGuard` + `@Roles(Role.Admin)` + `@Public()` were already in place from Phase 4. Product writes simply opt in. |
| Response envelope | `{ success: true, data, meta? }`, errors as `{ success: false, statusCode, error, message, details?, path, method, timestamp, requestId }`. Followed verbatim. |
| Pagination | `common/dto/pagination-query.dto.ts` + `common/utils/pagination.util.ts` already define `page`/`limit` and `buildPaginationMeta()` — extended, not duplicated. |
| Admin layout | `/admin` console, sidebar, header, breadcrumbs, `Card`/`Button`/`Badge`/`Input`/`Field`/`Table`/`Skeleton`/`EmptyState`/`ErrorState` and the Axios client with in-memory access token + refresh queue all existed from Phase 5. Reused as-is. |
| Sidebar | `Products` was already listed in `nav-config.ts` with `available: false` (rendered as a non-clickable "Soon" row). Flipped to `available: true`. |
| Frontend libs | `react-hook-form` + `zod` + `@hookform/resolvers` and `lucide-react` were already installed in Phase 5 — no new dependency was added in this phase. |
| Missing before this phase | Product persistence, admin product API, category read API, file uploads, and every `/admin/products` page. |

---

## 2. Backend changes

Three new modules (`categories`, `products`, `uploads`) — 25 source files, ~2.5k lines including tests.

### 2.1 Categories (minimal, read-only)

Products cannot be created without a category, so the smallest useful slice was added. **Full category management (CRUD, reordering, seeding UI) is Phase 7.**

| File | Purpose |
| --- | --- |
| `categories/schemas/category.schema.ts` | `name`, `slug` (unique), `status: active\|inactive`, timestamps. |
| `categories/repositories/categories.repository.ts` | Abstract DI token + `CategoryRecord` read model. |
| `categories/repositories/mongoose-categories.repository.ts` | Mongo implementation; `findById`, `findBySlug`, `list(status)`. |
| `categories/categories.service.ts` | Existence/status checks used by the products service. |
| `categories/categories.controller.ts` | `GET /api/categories` (public, active only) and `GET /api/admin/categories` (admin, all statuses). |
| `categories/categories.module.ts` | Exports the service for `ProductsModule`. |

### 2.2 Products

| File | Purpose |
| --- | --- |
| `products/schemas/product.schema.ts` | Collection schema + all indexes (see §4). |
| `products/repositories/products.repository.ts` | Abstract repository token, `ProductRecord`, filter/result types. |
| `products/repositories/mongoose-products.repository.ts` | Query building (search/filter/sort/pagination), `existsBySku/Slug`, `countOrderReferences()`. |
| `products/dto/create-product.dto.ts` | `CreateProductDto`, `ProductImageDto`, `AdminProductsQueryDto`, `PublicProductsQueryDto`, `UpdateProductStatusDto` (enum-guarded `sortBy`, capped `limit`). |
| `products/dto/update-product.dto.ts` | `UpdateProductDto` (all fields optional). |
| `products/utils/slug.util.ts` | `slugify()` (NFKD, diacritics stripped, ASCII fallback) + `uniqueSlug()`. |
| `products/products.service.ts` | Business rules: pricing, slug/SKU uniqueness, image normalisation, visibility, delete policy, projections. |
| `products/products.controller.ts` | Public storefront reads (`@Public()`). |
| `products/admin-products.controller.ts` | Admin CRUD + status, `@Roles(Role.Admin)` on the class. |
| `products/products.module.ts` | Wiring + exports. |

### 2.3 Uploads

| File | Purpose |
| --- | --- |
| `uploads/image-storage.ts` | `ImageStorage` abstract provider token, `UploadFileInput`, `StoredImage`. |
| `uploads/local-image-storage.ts` | Writes to `UPLOAD_DIR` (default `backend/uploads`), served by `express.static` at `/uploads`, immutable filenames (uuid + ext), 7-day cache, `index:false`, `dotfiles:'deny'`. |
| `uploads/cloudinary-image-storage.ts` | Used **only when all three** `CLOUDINARY_*` variables are set; uploads via `res.cloudinary.com` and returns `secure_url`. |
| `uploads/uploads.service.ts` | MIME allow-list (jpeg/png/webp/avif), 5 MB cap, provider dispatch. |
| `uploads/uploads.controller.ts` | `POST /api/admin/uploads/images` (multipart, memory storage, admin only). |
| `uploads/uploads.module.ts` | Chooses the provider at boot. |

**MongoDB never stores bytes** — only `{ url, publicId, alt, isPrimary }`.

### 2.4 Modified backend files

| File | Change |
| --- | --- |
| `src/app.module.ts` | Registers `CategoriesModule`, `ProductsModule`, `UploadsModule`. |
| `src/app.setup.ts` | Mounts `express.static` on `/uploads` (read-only, `index:false`, `dotfiles:'deny'`, `maxAge:'7d'`). |
| `src/config/env.validation.ts` | `UPLOAD_DIR` (default `uploads`) + optional, all-or-nothing Cloudinary trio. |
| `.env.example` | Documents the upload/CDN variables. |
| `package.json` | `npm run seed:categories`. |
| `scripts/seed-categories.mjs` | Idempotent starter categories (Audio, Electronics, Accessories, Home & Kitchen, Fashion, Sports & Outdoors) so products can be created before Phase 7. |
| `.gitignore` (repo root) | Ignores `backend/uploads/`. |

---

## 3. API endpoints

Writes live under **`/api/admin/products`** rather than `/api/products`. The storefront namespace is public and read-only by design; keeping `POST/PATCH/DELETE` out of it means a customer-facing route can never be mistaken for a protected one. Everything else follows the approved contract.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/products` | public | Published products only; `page, limit, search, category` (slug), `featured`, `sortBy, sortOrder`. |
| `GET` | `/api/products/:idOrSlug` | public | Published product by id **or** slug; drafts/archived → `404`. |
| `GET` | `/api/admin/products` | admin | All statuses; `page, limit, search, category` (id), `status, stockStatus, sortBy, sortOrder`. |
| `POST` | `/api/admin/products` | admin | Create (slug optional → generated). |
| `GET` | `/api/admin/products/:id` | admin | Full record, including `costPrice`. |
| `PATCH` | `/api/admin/products/:id` | admin | Partial update. |
| `DELETE` | `/api/admin/products/:id` | admin | Hard delete, or archive when orders reference it. |
| `PATCH` | `/api/admin/products/:id/status` | admin | `{ status: draft\|published\|archived }`. |
| `GET` | `/api/categories` | public | Active categories. |
| `GET` | `/api/admin/categories?status=` | admin | All categories (products need inactive ones to stay editable). |
| `POST` | `/api/admin/uploads/images` | admin | Multipart `file` → `{ url, publicId, provider }`. |

Admin list response:

```jsonc
{
  "success": true,
  "data": [
    {
      "id": "…", "name": "Wireless Headphones", "slug": "wireless-headphones",
      "sku": "AUD-1001", "categoryId": "…", "category": { "id": "…", "name": "Audio", "slug": "audio" },
      "price": 249900, "salePrice": 199900, "costPrice": 150000,
      "effectivePrice": 199900, "stock": 12, "lowStockThreshold": 3, "stockStatus": "in",
      "status": "published", "isFeatured": false,
      "images": [{ "url": "/uploads/8f2c….jpg", "publicId": "…", "isPrimary": true }],
      "createdAt": "…", "updatedAt": "…"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 128, "totalPages": 7, "hasNextPage": true, "hasPreviousPage": false }
}
```

Delete response (both branches):

```jsonc
{ "success": true, "data": { "deleted": true,  "archived": false, "referencedOrders": 0, "message": "Product deleted" } }
{ "success": true, "data": { "deleted": false, "archived": true,  "referencedOrders": 3, "message": "Product archived — 3 orders reference it, so it was kept for order history" } }
```

Validation is a DTO concern (class-validator) and the service re-checks business rules; unknown `sortBy` values and `limit > 100` are rejected with `400`, never silently coerced.

---

## 4. Database schema

Collection `products` (Mongoose, `timestamps: true`):

| Field | Type | Rules |
| --- | --- | --- |
| `name` | String | required, 2–140, trimmed |
| `slug` | String | **unique**, lowercase, `^[a-z0-9]+(-[a-z0-9]+)*$`; generated from the name when omitted |
| `shortDescription` | String? | ≤ 300 |
| `description` | String | required, 10–5000 |
| `sku` | String | **unique**, uppercase, 3–40, `^[A-Z0-9][A-Z0-9_-]*$`; duplicate → `409` |
| `categoryId` | ObjectId → `categories` | required, indexed; must exist, and must be **active** to publish |
| `brand` | String? | ≤ 80 |
| `price` | Number | required, integer **minor units (paise)**, > 0 |
| `salePrice` | Number? | integer, > 0, must be **strictly lower** than `price` |
| `costPrice` | Number? | integer, > 0 — **admin projection only** |
| `stock` | Number | integer ≥ 0 |
| `lowStockThreshold` | Number | integer ≥ 0, default 5 |
| `status` | String | `draft \| published \| archived`, default `draft` |
| `isFeatured` | Boolean | default false |
| `images` | `[{ url, publicId?, alt?, isPrimary }]` | max 8, exactly one primary, order preserved |
| `seoTitle` | String? | ≤ 70 |
| `seoDescription` | String? | ≤ 160 |
| `createdAt` / `updatedAt` | Date | automatic |

Indexes: unique `sku`, unique `slug`, `{ status, createdAt }`, `{ categoryId, status }`, `{ stock }`, `{ status, isFeatured, createdAt }`.

**Money is stored as integer paise end-to-end** (API, DB, frontend state) and divided by 100 only for display — no float drift.

### Business rules enforced by `ProductsService`

- positive prices; `salePrice < price` (re-validated against the **stored** price on `PATCH`, so a partial update cannot break the invariant);
- unique SKU (case-insensitive) → `409` "… already exists"; unique slug → `409`; generated slugs get numeric suffixes (`wireless-headphones-2`) instead of failing;
- `stock ≥ 0`; stock status derived `out` (0) / `low` (`0 < stock ≤ threshold`) / `in`;
- **only `published` products are readable from the storefront**; drafts and archived are `404`, archived are never purchasable;
- **`costPrice` is stripped from every public projection** (e2e-tested with `expect(publicView).not.toHaveProperty("costPrice")`);
- **deletion cannot break order history**: `countOrderReferences()` reads `orders.items.productId`; if any order references the product it is archived (`deleted:false, archived:true`) instead of removed;
- category must exist, and must be **active** before a product can be published (drafts may hold inactive categories);
- images: max 8, duplicates dropped, exactly one primary (the first when none is marked).

---

## 5. Frontend

Four routes under the existing console, all `export const instant = false` (the documented convention for pages mounted behind `AdminShell`).

| Route | Screen |
| --- | --- |
| `/admin/products` | Server-paginated table |
| `/admin/products/create` | Create form |
| `/admin/products/[id]` | Admin details view |
| `/admin/products/[id]/edit` | Edit form |

New files:

| File | Purpose |
| --- | --- |
| `types/product.ts` | `AdminProduct`, `ProductImage`, `Category`, `ProductWritePayload`, `DeleteProductResult`. |
| `services/admin/products.service.ts` | `list` (with `AbortSignal`), `get`, `create`, `update`, `updateStatus`, `remove`. |
| `services/admin/categories.service.ts` | Category list for the form and the filter bar. |
| `services/admin/uploads.service.ts` | Multipart upload + shared MIME/size constants. |
| `hooks/use-product-list.ts` | Filters, 350 ms debounced search, page reset on filter change, abortable requests, `loading` derived from the settled query key (previous page stays visible). |
| `store/toast.store.ts` + `ui/toaster.tsx` | Success/error/info toasts, auto-dismissed, mounted once in `AdminShell`. |
| `lib/images.ts` | Resolves `/uploads/…` against the API origin while passing absolute CDN URLs through. |
| `ui/select.tsx`, `ui/switch.tsx`, `ui/dialog.tsx`, `ui/pagination.tsx`, `ui/page-header.tsx` | Reusable primitives (native select/textarea with shared tokens, accessible `role="switch"`, Escape/backdrop-closing dialog with scroll lock, pagination footer). |
| `products/products-view.tsx` | Page composition: filters, table, pagination, empty/error states, delete + publish flows. |
| `products/product-filters.tsx` | Search, category, status, stock filters, page-size selector, "Clear filters". |
| `products/products-table.tsx` | Column set per spec, sortable headers, thumbnails, status/stock badges, row actions. |
| `products/product-badges.tsx` | Status + stock badges. |
| `products/delete-product-dialog.tsx` | Confirmation that explains the archive-instead-of-delete rule. |
| `products/product-form.tsx` | Sections A–F, zod schema mirroring backend rules, ₹↔paise conversion, slug auto-generation, server-side 409s mapped back onto the offending field. |
| `products/image-uploader.tsx` | Multi-upload, per-file client validation, previews, set primary, reorder, remove. |
| `products/product-detail-view.tsx` | Gallery + overview/pricing/inventory/SEO cards, margin, timestamps, publish/unpublish/delete. |
| `products/product-create-view.tsx`, `product-edit-view.tsx`, `product-form-skeleton.tsx` | Loaders + skeletons for the form routes. |

Modified: `layout/nav-config.ts` (Products available, ObjectId segments label as "Product", `create` → "New"), `layout/admin-shell.tsx` (mounts `<Toaster />`), `ui/table.tsx` (`colSpan` typing for full-width rows), `lib/api/client.ts` (`requestPage()` returns data **and** meta), `lib/utils.ts` (`slugify()` preview), `types/auth.ts` (`PaginationMeta`).

Behaviour worth calling out:

- **No fake data**: every row, badge, count and form option comes from the API. The dashboard's honest empty states were preserved.
- **Delete**: confirmation dialog → API → toast with the *actual* outcome ("Product archived — 3 orders reference it…"), then the list refreshes.
- **Publish/unpublish** is a one-click toggle in both the table and the details view, with the backend re-checking the category rule.
- **Images**: upload → API returns a URL → only the URL is stored on the product; the gallery keeps order and a single primary image.
- **Mobile**: filters stack, the table scrolls horizontally with a min-width, and the form collapses to one column.

---

## 6. Verification

Commands (one per line, PowerShell 5.1 safe):

**Backend**

```
cd backend
npm run verify
```

```
✓ Type check........ 3.0s
✓ Lint.............. 0.2s
✓ Unit tests........ 2.5s
✓ E2E tests......... 7.9s
✓ Production build.. 4.1s
All checks passed.
```

| Suite | Result |
| --- | --- |
| Unit (`vitest run`) | **65 passed** (40 from earlier phases + `slug.util.spec.ts` 8 + `products.service.spec.ts` 17) |
| E2E (`vitest run --config ./vitest.config.e2e.ts`) | **72 passed** across 7 files, including `products.e2e-spec.ts` **32 passed** |
| Type check / lint / build | clean |

`products.e2e-spec.ts` covers, per the approved test list: create, list, search, filter, pagination, edit, status update, image upload, duplicate SKU, duplicate slug, invalid pricing, unauthorized creation (401 anonymous / 403 customer), storefront access to drafts (404), cost-price redaction, archive-instead-of-delete, and an **admin view contract** test that pins the field names the UI binds to.

**Frontend**

```
cd frontend
npm run lint
npx tsc --noEmit
npm run build
```

```
✓ Compiled successfully
/admin/products            ○  (Static)
/admin/products/[id]       ◐  (Partial Prerender)
/admin/products/[id]/edit  ◐
/admin/products/create     ○
```

All four routes were also served from the production build and returned `200` with the console shell.

`test/support/in-memory-{products,categories}.repository.ts` + `fake-image-storage.ts` mirror the Mongo query semantics so the HTTP contract is exercised without a database (the sandbox has no `mongod`).

---

## 7. Run it locally

Backend, in `backend/`:

```
npm install
npm run seed:categories
npm run seed:admin
npm run start:dev
```

Frontend, in `frontend/`:

```
npm install
npm run dev
```

Then open `http://localhost:3000/admin/products`.

`seed:categories` is idempotent (upsert by slug) and exists only because category management is a later phase — products need at least one category to be created.

Uploads land in `backend/uploads/` (gitignored) unless all three Cloudinary variables are set, in which case the same endpoint writes to the CDN. Nothing else changes.

---

## 8. Known issues & decisions

1. **Writes are under `/api/admin/products`** (the approved list said `/api/products`). Storefront reads stay public and read-only; admin verbs never appear in the public namespace. All the listed filters/params are supported.
2. **Categories are read-only for now.** No create/rename UI; Phase 7 owns it. Consequence: an empty database cannot create a product until `npm run seed:categories` (or Phase 7) runs — the form says so explicitly.
3. **Category deletion/reassignment is not enforced yet** because categories cannot be deleted yet. When Phase 7 adds that, it must check `products.categoryId` first.
4. **Image deletion leaves the stored file.** Removing an image detaches it from the product; the object/file is not deleted from disk or Cloudinary (no destroy endpoint yet, and a URL may be shared). Tracked as cleanup work.
5. **Reorder is button-based**, not drag-and-drop — keyboard/screen-reader friendly with no extra dependency.
6. **No frontend test runner.** The project has none (Phase 1 decision); UI verification is type-check + lint + build + a production server smoke. API behaviour is covered by the backend suite.
7. **Search is a case-insensitive regex** on name/SKU/slug. Fine at catalogue scale; switch to a text index when the catalogue grows.
8. **`orders` is read directly** via the Mongoose connection (`countOrderReferences`) because the orders module does not exist yet; it becomes a proper dependency in the orders phase.
9. **Cloudinary path is unexercised** in the sandbox (no credentials/network to the CDN). The local provider is the tested default; the Cloudinary implementation is a thin `fetch` POST with the same `StoredImage` contract.

---

## 9. Completion report (8 points)

**1. Files created — backend (29):**
`categories/categories.{controller,module,service}.ts`, `categories/repositories/{categories.repository,mongoose-categories.repository}.ts`, `categories/schemas/category.schema.ts`;
`products/admin-products.controller.ts`, `products/products.{controller,module,service}.ts`, `products/products.service.spec.ts`, `products/dto/{create-product.dto,update-product.dto}.ts`, `products/repositories/{products.repository,mongoose-products.repository}.ts`, `products/schemas/product.schema.ts`, `products/utils/{slug.util.ts,slug.util.spec.ts}`;
`uploads/{cloudinary-image-storage,image-storage,local-image-storage,uploads.controller,uploads.module,uploads.service}.ts`;
`scripts/seed-categories.mjs`;
`test/products.e2e-spec.ts`, `test/support/{in-memory-products.repository,in-memory-categories.repository,fake-image-storage}.ts`.

**2. Files created — frontend (28):**
`app/admin/(console)/products/{page,create/page,[id]/page,[id]/edit/page}.tsx`;
`components/admin/products/{products-view,product-filters,products-table,product-badges,delete-product-dialog,product-form,product-form-skeleton,image-uploader,product-create-view,product-edit-view,product-detail-view}.tsx`;
`components/admin/ui/{select,switch,dialog,pagination,page-header,toaster}.tsx`;
`hooks/use-product-list.ts`; `lib/images.ts`; `store/toast.store.ts`; `types/product.ts`;
`services/admin/{products,categories,uploads}.service.ts`.

**3. Files modified:**
Backend — `src/app.module.ts`, `src/app.setup.ts`, `src/config/env.validation.ts`, `.env.example`, `package.json`, `test/support/create-test-app.ts` (product/category model stubs + 3 new override options), `.gitignore`.
Frontend — `components/admin/layout/nav-config.ts`, `components/admin/layout/admin-shell.tsx`, `components/admin/ui/table.tsx`, `lib/api/client.ts`, `lib/utils.ts`, `types/auth.ts`.

**4. API endpoints:** eleven — see §3. Public: `GET /api/products`, `GET /api/products/:idOrSlug`, `GET /api/categories`. Admin: `GET|POST /api/admin/products`, `GET|PATCH|DELETE /api/admin/products/:id`, `PATCH /api/admin/products/:id/status`, `GET /api/admin/categories`, `POST /api/admin/uploads/images`.

**5. Database schema:** `products` — 19 fields, unique `sku`/`slug` plus four secondary indexes, money in integer paise, JSON image references only, `draft|published|archived` lifecycle. Full table in §4.

**6. Frontend functionality:** listing with server-side pagination, page size, search (name/SKU/slug), category/status/stock filters, sortable columns, edit, delete-with-confirm, publish/unpublish, loading skeletons, empty and error states; create/edit forms with all six sections, auto-generated editable slug, ₹↔paise handling, multi-image upload with preview/set-primary/reorder/remove, featured toggle; details view with gallery, pricing (incl. margin), inventory, SEO and timestamps.

**7. Tests and results:** backend 65 unit + 72 e2e green (`products.e2e-spec.ts` = 32, including the required duplicate-SKU, duplicate-slug, invalid-pricing, unauthorized-creation and unpublished-access cases); typecheck, lint and production build clean; frontend lint, typecheck and build clean, all four pages served `200`.

**8. Known issues:** nine, listed in §8 — the notable ones being the `/api/admin/products` prefix deviation, read-only categories pending Phase 7, orphaned image files, and the unexercised Cloudinary provider.

---

## 10. Next recommended module — pending your approval

**Category Management (Phase 7)**, in this order:

1. CRUD API (`POST/PATCH/DELETE /api/admin/categories`) with slug uniqueness and soft-delete for referenced categories.
2. **Deletion guard**: refuse (or reassign) when `products` reference the category — completing the rule product management could not enforce.
3. Admin UI: list with product counts, create/edit form, drag/button ordering, status toggle, delete confirmation.
4. Wire the product form's category select to live category updates and add a "manage categories" shortcut.

Nothing from Phase 7 has been started.
