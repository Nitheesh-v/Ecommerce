# Phase 7 — Category Management

> **Scope approved for this phase:** full category CRUD (create, edit, delete, activate/deactivate), images, descriptions, SEO slugs, search/filter/pagination, hierarchical parent → subcategory support with cycle prevention, product counts, and storefront integration. **Inventory Management was deliberately not started.**
>
> Result: `/admin/categories` (list, create, view, edit) backed by a real API, 31 category e2e tests + 18 service unit tests, and a first storefront slice (`/`, `/categories`, `/categories/[slug]`, `/products/[slug]`) that renders active categories and their products from the same public API.

---

## 1. Inspection findings

| Area | Finding |
| --- | --- |
| Category storage | A **minimal** `categories` module already existed from Phase 6 — `name`, `slug` (unique), `status`, timestamps — created only because products need a category to reference. No description, image, parent, ordering or SEO fields. |
| Category API | Two read-only endpoints: `GET /api/categories` (public, active) and `GET /api/admin/categories?status=` (admin, unpaged). No write endpoints at all. |
| Consumers of the shape | `ProductsService` resolves names/statuses through `CategoriesService`; the dashboard joins `products.categoryId → categories._id`; products DTOs validate `categoryId` with `@IsMongoId`. Any change had to keep those working. |
| Storefront | **Nothing existed.** `/` was still the Next.js starter page; there were no store routes, no public API client and no product pages. |
| Reusable pieces | Admin shell, nav, `Card`/`Button`/`Field`/`Select`/`Textarea`/`Table`/`Dialog`/`Pagination`/`Toaster`, `requestData`/`requestPage`, the image upload endpoint and `ImageUploader` patterns from Phase 6. |
| Gaps | Hierarchy, images, SEO, ordering, product counts, safe deletion, pagination/sorting, and the entire storefront. |

Two decisions followed from this:

1. the existing `categories` collection is **extended in place** (no migration, no new collection), so products and the dashboard keep working;
2. the storefront is added as a **read-only consumer** of the public API — no second source of truth.

---

## 2. Backend

### 2.1 Files

| File | Status | Purpose |
| --- | --- | --- |
| `categories/schemas/category.schema.ts` | modified | Adds `description`, `image`, `parentId`, `displayOrder`, `seoTitle`, `seoDescription`; keeps `name`/`slug`/`status`; new indexes. |
| `categories/repositories/categories.repository.ts` | modified | Contract: `listPage`, `findById`, `findBySlug`, `create`, `update`, `delete`, `existsByNameUnderParent`, `existsBySlug`, `countChildren`, `countProducts`, plus the legacy `list` used by products. |
| `categories/repositories/mongoose-categories.repository.ts` | modified | Query building (search/status/parent/sort/pagination), case-insensitive sibling-name lookup, product counts aggregated from the `products` collection. |
| `categories/dto/create-category.dto.ts` | new | `CreateCategoryDto`, `CategoryImageDto`. |
| `categories/dto/update-category.dto.ts` | new | `UpdateCategoryDto` (`PartialType`), `UpdateCategoryStatusDto`. |
| `categories/dto/categories-query.dto.ts` | new | `AdminCategoriesQueryDto`, `PublicCategoriesQueryDto`. |
| `categories/categories.service.ts` | rewritten | All business rules (see §3). |
| `categories/categories.controller.ts` | rewritten | Public storefront reads. |
| `categories/admin-categories.controller.ts` | new | Admin CRUD, admin-only. |
| `categories/categories.module.ts` | modified | Registers both controllers. |
| `categories/categories.service.spec.ts` | new | 18 unit tests. |
| `common/utils/slug.util.ts` (+ spec) | moved | Slug helpers shared by products and categories (`fallback` parameter). |
| `products/products.service.ts` | modified | Imports the moved slug util. |
| `test/support/in-memory-categories.repository.ts` | rewritten | Mirrors the Mongo semantics (sibling names, parent filters, product counts via provider). |
| `test/support/in-memory-products.repository.ts` | modified | `countInCategory()` so category product counts work in tests. |
| `test/categories.e2e-spec.ts` | new | 31 e2e tests. |

### 2.2 Endpoints

Writes live under **`/api/admin/categories`**, matching `/api/admin/products` and `/api/admin/dashboard`: the public `/api/categories` namespace never exposes a write verb. (The brief listed `/api/categories` for everything; this is the same documented deviation as Phase 6.)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/categories` | public | Active categories, nested tree (`?tree=false` for a flat list, `?parent=<slug>` for one level). |
| `GET` | `/api/categories/:slug` | public | Active category + breadcrumb + children + siblings; inactive → `404`. |
| `GET` | `/api/admin/categories` | admin | `page, limit, search, status, parentId (id \| root), sortBy, sortOrder`; each row carries `productCount` and `childrenCount`. |
| `POST` | `/api/admin/categories` | admin | Create (slug optional → generated). |
| `GET` | `/api/admin/categories/:id` | admin | Full record with counts and `parentPath`. |
| `PATCH` | `/api/admin/categories/:id` | admin | Partial update (name, slug, description, image, parent, order, status, SEO). |
| `PATCH` | `/api/admin/categories/:id/status` | admin | `{ status: 'active' \| 'inactive' }`. |
| `DELETE` | `/api/admin/categories/:id` | admin | Delete — only when the category has no children and no products. |

Admin list response:

```jsonc
{
  "success": true,
  "data": [
    {
      "id": "…", "name": "Mobiles", "slug": "mobiles",
      "description": "Smartphones and feature phones.",
      "image": { "url": "/uploads/….jpg", "publicId": "…", "alt": "Mobiles" },
      "parentId": "…", "parent": { "id": "…", "name": "Electronics", "slug": "electronics" },
      "parentPath": "Electronics",
      "displayOrder": 2, "status": "active",
      "seoTitle": "Mobile Phones", "seoDescription": "Buy the latest phones.",
      "productCount": 12, "childrenCount": 0,
      "createdAt": "…", "updatedAt": "…"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 18, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false }
}
```

Storefront tree response (`GET /api/categories`):

```jsonc
{
  "success": true,
  "data": [
    {
      "id": "…", "name": "Electronics", "slug": "electronics",
      "description": "…", "image": { "url": "/uploads/…" },
      "displayOrder": 0, "productCount": 12,
      "seoTitle": null, "seoDescription": null,
      "children": [
        { "id": "…", "name": "Mobiles", "slug": "mobiles", "productCount": 8, "children": [] }
      ]
    }
  ]
}
```

Deletion that is refused explains why:

```jsonc
{ "success": false, "statusCode": 409, "error": "Conflict",
  "message": "\"Electronics\" has 2 subcategories. Move or delete them first." }
```

---

## 3. Schema & business rules

### 3.1 Schema (collection `categories`)

| Field | Type | Rules |
| --- | --- | --- |
| `name` | String | required, 2–80, trimmed |
| `slug` | String | **unique**, lowercase, `^[a-z0-9]+(-[a-z0-9]+)*$`; generated from the name when omitted |
| `description` | String? | ≤ 500 |
| `image` | `{ url, publicId?, alt? }` | URL reference only — bytes never enter MongoDB |
| `parentId` | ObjectId? → `categories` | `null` = top level, indexed |
| `displayOrder` | Number | 0–9999, default 0, manual ordering within a level |
| `status` | String | `active \| inactive`, default active, indexed |
| `seoTitle` | String? | ≤ 70 |
| `seoDescription` | String? | ≤ 160 |
| `createdAt` / `updatedAt` | Date | automatic |

Indexes: unique `slug`; `{ status, displayOrder, name }` (storefront); `{ parentId, displayOrder }` (trees/children); `{ parentId, name }` (sibling lookups).

### 3.2 Rules implemented in `CategoriesService`

| # | Rule | Behaviour |
| --- | --- | --- |
| 1 | Name required | DTO `@IsNotEmpty` + 2–80 chars |
| 2 | Unique slug | explicit duplicate → `409`; generated duplicates get `-2`, `-3`… |
| 3 | Cannot be its own parent | `400 "A category cannot be its own parent"` |
| 4 | No cycles | ancestors of the new parent are walked; if the category is among them → `400 "…cannot be nested under one of its own subcategories"` |
| 5 | Valid nesting | max **3 levels** (`400` beyond), parent must exist, `parentId` must be an ObjectId |
| 6 | Safe deletion | `409` when `childrenCount > 0` or `productCount > 0`, with counts in the message |
| 7 | Only active categories public | storefront reads filter `status: 'active'`; inactive → `404` |
| 8 | Products need their own published status | unchanged from Phase 6: public products are filtered by `status: 'published'` **and** the category must be active to publish |
| 9 | Category changes cannot break products | the `_id` is immutable; renames/slug changes keep `products.categoryId` valid; products never embed a category name |
| 10 | Duplicate names | unique **per parent**, case-insensitive (`409`); the same name may exist under a different parent |
| 11 | Safe queries | every user input is escaped before `RegExp` use; `parentId`/`id` are ObjectId-validated; `limit ≤ 100`; sorts are enum-guarded |
| 12 | Product counts | aggregated from the `products` collection by `categoryId` for the whole page (one query, not N+1) |

Deactivating a category does **not** unpublish its products — that is an explicit choice: publishing is the product's own decision (`status`), and the storefront still shows published products. Re-publishing a product whose category is inactive is refused by the products module (`400`), so the two modules cannot drift apart.

---

## 4. Frontend — admin console

| Route | Screen |
| --- | --- |
| `/admin/categories` | Server-paginated table |
| `/admin/categories/create` | Create form |
| `/admin/categories/[id]` | Details + hierarchy |
| `/admin/categories/[id]/edit` | Edit form |

Files (new):

| File | Purpose |
| --- | --- |
| `types/category.ts` | `AdminCategory`, `CategoryNode`, `CategoryPageView`, `CategoryWritePayload`, `CategoryListQuery`. |
| `services/admin/categories.service.ts` | `list` (paged, abortable), `listAll()` (walks `limit=100` pages), `get`, `create`, `update`, `updateStatus`, `remove`, plus `descendantIdsOf()` for the parent picker. |
| `hooks/use-category-list.ts` | Debounced search, filters, page reset, abortable fetch, derived loading. |
| `components/admin/categories/categories-view.tsx` | Page composition, status toggle, delete flow, `?parentId=` deep link. |
| `categories-table.tsx` | Image, name (+subcategory count), slug, parent, product count, status, created, actions. |
| `category-filters.tsx` | Search, status, parent (indented tree), page size, clear. |
| `category-form.tsx` | Basic info + SEO + image + status; slug auto-generation; server 409s mapped to fields. |
| `category-image-field.tsx` | Upload / preview / replace / remove, reusing `POST /api/admin/uploads/images`. |
| `category-tree-select.tsx` | Indented `<select>` built from the tree; excludes self + descendants. |
| `delete-category-dialog.tsx` | Explains the deletion guard and shows the API's reason inline. |
| `category-avatar.tsx`, `category-form-skeleton.tsx`, `category-create-view.tsx`, `category-edit-view.tsx`, `category-detail-view.tsx` | Table/detail presentation. |

Modified: `layout/nav-config.ts` (Categories is now available), and the three product views that consumed `categoriesService.list()` now call `listAll()`.

Everything is API-backed — no mocked rows, no hardcoded counts.

---

## 5. Frontend — storefront integration

The storefront renders on the server and reads the **public** API only.

| Route | Content |
| --- | --- |
| `/` | Hero, up to 8 active categories (with images and counts), featured products. |
| `/categories` | All active departments with their subcategories. |
| `/categories/[slug]` | Breadcrumb, image, description, product count, subcategory chips, related categories, paginated product grid. |
| `/products/[slug]` | Product detail: gallery image, brand, prices, stock, description, category link. |

| File | Purpose |
| --- | --- |
| `lib/api/public.ts` | `fetch`-based reader for the public envelope, `StorefrontApiError`, `isNotFoundError`, optional empty fallback so an unavailable API cannot 500 the shop or break `next build`. |
| `services/store/catalog.service.ts` | `'use cache'` reads (`cacheLife('minutes')`, tagged `categories`/`products`). |
| `components/store/{store-header, category-card, product-card}.tsx` | Shell + cards. |
| `types/storefront.ts` | `PublicProduct` (never contains `costPrice`). |
| `app/(store)/layout.tsx` + 4 pages | The storefront itself; `app/page.tsx` (Next starter page) was removed. |

Guarantees:

- inactive categories are **never fetched** (the API filters them), and a direct URL to one renders the 404 page;
- unpublished products never appear: the grid uses `GET /api/products?category=<slug>`, which only returns `published` rows;
- existing product listing/detail behaviour is untouched — the public product endpoints were not modified in this phase (only the category projection gained the SEO fields it needed).

---

## 6. Verification

Backend (`cd backend`):

```
npm run verify
```

```
✓ Type check........ 4.8s
✓ Lint.............. 0.2s
✓ Unit tests........ 3.4s
✓ E2E tests......... 11.5s
✓ Production build.. 5.0s
All checks passed.
```

| Suite | Result |
| --- | --- |
| Unit | **83 passed** (65 from earlier phases + 18 new `categories.service.spec.ts`) |
| E2E | **105 passed** across 8 files, including `categories.e2e-spec.ts` **31 passed** |

`categories.e2e-spec.ts` covers every bullet in the brief: create, edit, delete, duplicate slug, duplicate name per level, search, filters (`status`, `parentId=root`, `parentId=<id>`), sorting, pagination, activate/deactivate, parent assignment, self-parent rejection, cycle rejection, depth cap, category with products (count + delete refusal), category with children (delete refusal), customer access to inactive categories (404 from the public API), and unauthorized admin operations (401 anonymous / 403 customer on every write).

Frontend (`cd frontend`):

```
npm run typecheck
npm run lint
npm run build
```

```
✓ Compiled successfully
/                            ○  (revalidate 1m)
/categories                  ○  (revalidate 1m)
/categories/[slug]           ◐
/products/[slug]             ◐
/admin/categories            ○
/admin/categories/create     ○
/admin/categories/[id]       ◐
/admin/categories/[id]/edit  ◐
```

The production build was also served and smoke-tested against a stub API: `/` rendered category cards and featured products, `/categories` rendered departments with subcategories, `/categories/electronics` rendered the header, subcategory chips and product grid, and `/products/wireless-headphones` rendered name, SKU and both prices.

---

## 7. Run it locally

Backend (`cd backend`):

```
npm install
npm run seed:categories
npm run seed:admin
npm run start:dev
```

Frontend (`cd frontend`):

```
npm install
npm run dev
```

Then:

- storefront → `http://localhost:3000/`
- admin → `http://localhost:3000/admin/categories`

`seed:categories` is now a convenience rather than a requirement: categories can be created from the console.

---

## 8. Known issues & decisions

1. **Writes live under `/api/admin/categories`** (brief said `/api/categories`) — same rationale as products: the public namespace stays read-only.
2. **Unknown or inactive slugs answer `200` with the 404 page body.** With Next 16 Cache Components a dynamic segment is streamed behind a Suspense boundary, and the status line is committed before the category lookup resolves. The UI is a real 404 page; only the HTTP status is soft. Fixing it requires build-time params (which would make `next build` depend on a running API) — documented rather than hacked around.
3. **Deleting a parent with children is refused, not cascaded.** The brief allowed "reassigned or deleted"; automatic cascade would silently delete products references, so the console requires the admin to move/delete children first. Reassignment UI is a candidate for a later phase.
4. **Deactivated categories keep their published products** (rule 7 is respected: product status decides visibility). Re-publishing a product into an inactive category is refused by the products module.
5. **Sibling-name uniqueness is enforced in the service, not by a unique index** — case-insensitive uniqueness needs a collation index, which would also affect the existing `slug` index. The lookup index `{ parentId, name }` keeps the check fast.
6. **Category images are single** (the brief asks for one). Deleting/replacing an image detaches the reference; the stored file is not deleted (no destroy endpoint yet, same as product images).
7. **Reorder is done via `displayOrder`**, not drag-and-drop — no extra dependency, works with keyboard and screen readers.
8. **Storefront pagination is 12 per page** and the product grid is not filterable/sortable yet (that belongs to a storefront phase).
9. **No storefront tests**: the project still has no frontend test runner; the storefront was verified by build + server-side smoke against a stub API, and its contract by the backend suite.

---

## 9. Completion report

**Files created (23):**
Backend — `categories/admin-categories.controller.ts`, `categories/categories.service.spec.ts`, `categories/dto/{create-category,update-category,categories-query}.dto.ts`, `test/categories.e2e-spec.ts`, `common/utils/slug.util.ts` + spec (moved from products).
Frontend — `types/category.ts`, `types/storefront.ts`, `hooks/use-category-list.ts`, `lib/api/public.ts`, `services/store/catalog.service.ts`, `app/admin/(console)/categories/{page, create/page, [id]/page, [id]/edit/page}.tsx`, 11 components in `components/admin/categories/`, `app/(store)/{layout,page, categories/page, categories/[slug]/page, products/[slug]/page}.tsx`, 3 components in `components/store/`.

**Files modified:** `categories/{schemas/category.schema,repositories/categories.repository,repositories/mongoose-categories.repository,categories.service,categories.controller,categories.module}.ts`, `products/products.service.ts`, `test/support/{in-memory-categories,in-memory-products}.repository.ts`, `frontend/src/services/admin/categories.service.ts`, `frontend/src/components/admin/layout/nav-config.ts`, the three product admin views, `frontend/src/app/page.tsx` (deleted).

**APIs implemented:** eight — `GET /api/categories`, `GET /api/categories/:slug`, `GET|POST /api/admin/categories`, `GET|PATCH|DELETE /api/admin/categories/:id`, `PATCH /api/admin/categories/:id/status`.

**Schema changes:** six new fields (`description`, `image`, `parentId`, `displayOrder`, `seoTitle`, `seoDescription`), four indexes, no migration required (existing documents read as `null`/`0`/active).

**Frontend pages completed:** `/admin/categories` (list), `/create`, `/[id]` (details), `/[id]/edit`; storefront `/`, `/categories`, `/categories/[slug]`, `/products/[slug]`.

**Storefront integration:** server-rendered, cached reads of the public API; active categories only; images and names; browse/filter products by category; parent → subcategory navigation with breadcrumbs and sibling links; inactive categories 404.

**Tests performed:** 18 new unit + 31 new e2e (105 e2e / 83 unit total), typecheck, lint and production build for both apps, plus a production-server smoke of the four storefront routes against a stub API.

**Remaining issues:** the nine items in §8 — most notably the soft-404 status on unknown slugs, the absence of cascade/reassign on delete, and the untested-in-browser image replacement flow.

---

## 10. Next recommended module — pending your approval

**Inventory Management**, in this order:

1. Stock adjustments (in/out/adjustment history) against the existing `products.stock` field, with an audit trail collection.
2. Low-stock views and bulk updates, reusing the dashboard's `0 < stock ≤ lowStockThreshold` rule.
3. Reserve/commit hooks the orders module will need, plus a "prevent overselling" check at checkout.

Nothing from Inventory has been started.
