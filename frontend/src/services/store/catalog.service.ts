import { cacheLife, cacheTag } from "next/cache";
import { fetchPublic, fetchPublicEnvelope, isNotFoundError } from "@/lib/api/public";
import type { CategoryNode, CategoryPageView } from "@/types/category";
import type { PublicProduct } from "@/types/storefront";

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
};
