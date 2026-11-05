/** Public product projection — never contains `costPrice`. */
export interface PublicProduct {
  id: string;
  name: string;
  slug: string;
  shortDescription?: string;
  description: string;
  sku: string;
  brand?: string;
  category: { id: string; name: string; slug: string } | null;
  /** Minor units (paise). */
  price: number;
  salePrice?: number | null;
  effectivePrice: number;
  stock: number;
  inStock: boolean;
  isFeatured: boolean;
  /** Approved-review mean (0–5, one decimal); `0` until the first review lands. */
  ratingAverage: number;
  ratingCount: number;
  images: { url: string; alt?: string; isPrimary: boolean }[];
  seoTitle?: string;
  seoDescription?: string;
  createdAt: string;
  updatedAt: string;
}

/** Sort options the public products endpoint accepts. */
export type StoreSortField = "createdAt" | "price" | "name" | "rating";

/**
 * Filter values for the catalogue sidebar.
 *
 * Computed by the API over everything published — not over the current query — so a
 * filter never disappears just because the current search excluded it.
 */
export interface ProductFacets {
  total: number;
  price: { min: number; max: number };
  ratings: { min: number; count: number }[];
  inStock: number;
  onSale: number;
  categories: {
    id: string;
    slug: string;
    name: string;
    count: number;
    minPrice: number;
    maxPrice: number;
  }[];
}

/** Everything the browse page can put in the URL. */
export interface CatalogueQuery {
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onSale?: boolean;
  minRating?: number;
  sortBy?: StoreSortField;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface ProductPage {
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
