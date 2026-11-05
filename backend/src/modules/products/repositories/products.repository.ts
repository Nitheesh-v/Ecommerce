import type { ProductStatus } from '../schemas/product.schema.js';

export interface ProductImageRecord {
  url: string;
  publicId?: string;
  alt?: string;
  isPrimary: boolean;
}

/** A product as services see it: plain data, no Mongoose document. */
export interface ProductRecord {
  id: string;
  name: string;
  slug: string;
  shortDescription?: string;
  description: string;
  sku: string;
  /** Stringified ObjectId; the service never handles driver types. */
  categoryId: string;
  brand?: string;
  /** All money fields are integer minor units (paise). */
  price: number;
  salePrice?: number | null;
  costPrice?: number | null;
  stock: number;
  lowStockThreshold: number;
  status: ProductStatus;
  isFeatured: boolean;
  /** Approved-review mean, 0–5 with one decimal; `0` until the first review lands. */
  ratingAverage: number;
  ratingCount: number;
  images: ProductImageRecord[];
  seoTitle?: string;
  seoDescription?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductImageInput {
  url: string;
  publicId?: string;
  alt?: string;
  isPrimary?: boolean;
}

export interface CreateProductInput {
  name: string;
  slug: string;
  shortDescription?: string;
  description: string;
  sku: string;
  categoryId: string;
  brand?: string;
  price: number;
  salePrice?: number | null;
  costPrice?: number | null;
  stock: number;
  lowStockThreshold: number;
  status: ProductStatus;
  isFeatured: boolean;
  images: ProductImageInput[];
  seoTitle?: string;
  seoDescription?: string;
}

export type UpdateProductInput = Partial<CreateProductInput>;

export type ProductSortField =
  | 'name'
  | 'price'
  | 'stock'
  | 'createdAt'
  | 'updatedAt'
  | 'rating';

/** `in` = buyable, `low` = at or below threshold, `out` = no stock left. */
export type StockStatusFilter = 'in' | 'low' | 'out';

export interface ProductListFilter {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  status?: ProductStatus;
  stockStatus?: StockStatusFilter;
  /** Storefront: only featured products. */
  isFeatured?: boolean;
  /** Storefront: price band on the effective (sale-aware) price, minor units. */
  minPrice?: number;
  maxPrice?: number;
  /** Storefront: only buyable products. */
  inStock?: boolean;
  /** Storefront: only products whose sale price undercuts the list price. */
  onSale?: boolean;
  /** Storefront: at least this star rating (approved reviews). */
  minRating?: number;
  sortBy: ProductSortField;
  sortOrder: 'asc' | 'desc';
}

export interface ProductCategoryFacet {
  categoryId: string;
  count: number;
  /** Effective-price bounds inside this category, minor units. */
  minPrice: number;
  maxPrice: number;
}

/**
 * Storefront filter values, computed over everything currently published.
 *
 * Deliberately *not* narrowed by the active search or price filter: a sidebar whose
 * options disappear as you use them is a trap. Category counts are the exception —
 * they are the catalogue's shape, not the query's.
 */
export interface ProductFacets {
  total: number;
  categories: ProductCategoryFacet[];
  price: { min: number; max: number };
  ratings: { min: number; count: number }[];
  inStock: number;
  onSale: number;
}

export interface ProductListResult {
  items: ProductRecord[];
  total: number;
}

/**
 * Persistence boundary for products (abstract class = Nest DI token).
 *
 * `create`/`update` return `null` when the unique SKU or slug index rejects the
 * write, so the service can translate that into a 409 without importing driver
 * error codes.
 */
export abstract class ProductsRepository {
  abstract create(input: CreateProductInput): Promise<ProductRecord | null>;

  abstract findById(id: string): Promise<ProductRecord | null>;

  abstract findBySlug(slug: string): Promise<ProductRecord | null>;

  abstract update(
    id: string,
    input: UpdateProductInput,
  ): Promise<ProductRecord | null>;

  abstract list(filter: ProductListFilter): Promise<ProductListResult>;

  abstract delete(id: string): Promise<boolean>;

  abstract existsBySku(sku: string, excludeId?: string): Promise<boolean>;

  abstract existsBySlug(slug: string, excludeId?: string): Promise<boolean>;

  /**
   * Orders that contain this product in `items`. Non-zero means deleting the
   * product would orphan history, so the service archives instead.
   */
  abstract countOrderReferences(productId: string): Promise<number>;

  /**
   * Writes the denormalised rating for one product.
   *
   * Called by the reviews module after a moderation change; it is a cache write, so
   * a missing product is a no-op rather than an error.
   */
  abstract updateRating(
    productId: string,
    average: number,
    count: number,
  ): Promise<void>;

  /** Filter values for the storefront, over published products only. */
  abstract facets(): Promise<ProductFacets>;
}
