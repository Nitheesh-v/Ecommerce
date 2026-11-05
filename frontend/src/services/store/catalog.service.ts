import { cacheLife, cacheTag } from "next/cache";
import { fetchPublic, fetchPublicEnvelope, isNotFoundError } from "@/lib/api/public";
import type { CategoryNode, CategoryPageView } from "@/types/category";
import type { PublicStoreSettings } from "@/types/settings";
import type {
  CatalogueQuery,
  ProductFacets,
  ProductPage,
  PublicProduct,
  StoreSortField,
} from "@/types/storefront";

interface ProductListResult {
  items: PublicProduct[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/**
 * Storefront catalogue reads.
 *
 * Two rules are encoded here:
 * 1. only the *public* endpoints are used, so inactive categories and
 *    unpublished products are never even fetched;
 * 2. every read is `'use cache'`d for a few minutes, which is what lets Next
 *    prerender these pages (Cache Components requires data to be cached or
 *    streamed) while keeping the API as the source of truth.
 */

async function readCategoryTree(): Promise<CategoryNode[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("categories");

  // Empty fallback: a restarting API must not turn the storefront into a 500.
  return fetchPublic<CategoryNode[]>("/categories", undefined, { fallback: [] });
}

async function readCategoryPage(slug: string): Promise<CategoryPageView | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("categories", `category-${slug}`);

  try {
    return await fetchPublic<CategoryPageView>(
      `/categories/${encodeURIComponent(slug)}`,
    );
  } catch (error) {
    // An inactive or unknown category is a 404, not a failed request.
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

async function readCategoryProducts(
  categorySlug: string,
  page: number,
  limit: number,
): Promise<ProductListResult> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products", `category-${categorySlug}`);

  const envelope = await fetchPublicEnvelope<PublicProduct[]>(
    "/products",
    {
      category: categorySlug,
      page,
      limit,
      sortBy: "createdAt",
      sortOrder: "desc",
    },
    { fallback: [] },
  );

  return {
    items: envelope.data,
    meta:
      envelope.meta ?? {
        page,
        limit,
        total: envelope.data.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
  };
}

async function readProduct(slug: string): Promise<PublicProduct | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products", `product-${slug}`);

  try {
    return await fetchPublic<PublicProduct>(`/products/${encodeURIComponent(slug)}`);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

async function readFeaturedProducts(limit: number): Promise<PublicProduct[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");

  return fetchPublic<PublicProduct[]>(
    "/products",
    { featured: "true", limit, sortBy: "createdAt", sortOrder: "desc" },
    { fallback: [] },
  );
}

/** The newest published products — the home page's "just landed" rail. */
async function readNewArrivals(limit: number): Promise<PublicProduct[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");

  return fetchPublic<PublicProduct[]>(
    "/products",
    { limit, sortBy: "createdAt", sortOrder: "desc" },
    { fallback: [] },
  );
}

/** Products with a sale price below list — the deals rail. */
async function readDeals(limit: number): Promise<PublicProduct[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");

  return fetchPublic<PublicProduct[]>(
    "/products",
    { onSale: "true", limit, sortBy: "price", sortOrder: "asc" },
    { fallback: [] },
  );
}

/** Highest rated first, which is what a marketplace puts above the fold. */
async function readTopRated(limit: number): Promise<PublicProduct[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");

  return fetchPublic<PublicProduct[]>(
    "/products",
    { sortBy: "rating", sortOrder: "desc", limit },
    { fallback: [] },
  );
}

/**
 * The store's public profile (name, contact, COD switch).
 *
 * Comes from the settings document an admin edits, so the footer can stop promising
 * cash-on-delivery the moment the store turns it off.
 */
async function readStoreProfile(): Promise<PublicStoreSettings | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("settings");

  try {
    return await fetchPublic<PublicStoreSettings>("/store/settings");
  } catch {
    // A restarting API must not break the landing page (or `next build`).
    return null;
  }
}

async function readFacets(): Promise<ProductFacets | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products", "categories");

  try {
    return await fetchPublic<ProductFacets>("/products/facets");
  } catch {
    // The sidebar degrades to "filters unavailable"; the grid still renders.
    return null;
  }
}

/**
 * The browse page's read.
 *
 * Every filter is part of the cache key (this is a `'use cache'` function), so two
 * customers paging through different filters never share a page.
 */
async function readBrowse(query: CatalogueQuery): Promise<ProductPage> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products", query.search ? `search-${query.search}` : "products");

  const envelope = await fetchPublicEnvelope<PublicProduct[]>(
    "/products",
    {
      search: query.search,
      category: query.category,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      inStock: query.inStock ? "true" : undefined,
      onSale: query.onSale ? "true" : undefined,
      minRating: query.minRating,
      sortBy: (query.sortBy ?? "createdAt") satisfies StoreSortField,
      sortOrder: query.sortOrder ?? "desc",
      page: query.page ?? 1,
      limit: query.limit ?? 12,
    },
    { fallback: [] },
  );

  return {
    items: envelope.data,
    meta: envelope.meta ?? {
      page: query.page ?? 1,
      limit: query.limit ?? 12,
      total: envelope.data.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

export const catalogService = {
  /** Active categories, nested (roots with their children). */
  categoryTree: () => readCategoryTree(),

  /** One active category with breadcrumb, children and siblings; `null` when hidden. */
  categoryPage: (slug: string) => readCategoryPage(slug),

  /** Products of a category (by slug), server-paginated. */
  categoryProducts: (categorySlug: string, page = 1, limit = 12) =>
    readCategoryProducts(categorySlug, page, limit),

  /** A published product by slug (or id); `null` when it is not public. */
  product: (slug: string) => readProduct(slug),

  /** Featured products for the landing page. */
  featuredProducts: (limit = 8) => readFeaturedProducts(limit),

  /** Newest published products. */
  newArrivals: (limit = 8) => readNewArrivals(limit),

  /** Products currently on sale. */
  deals: (limit = 8) => readDeals(limit),

  /** Highest-rated products. */
  topRated: (limit = 8) => readTopRated(limit),

  /** Filter values for the catalogue sidebar; `null` when the API is unreachable. */
  facets: () => readFacets(),

  /** A filtered, sorted, paginated page of the catalogue. */
  browse: (query: CatalogueQuery) => readBrowse(query),

  /** Public store profile (contact details, COD availability). */
  storeProfile: () => readStoreProfile(),
};
