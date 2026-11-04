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

export type ProductSortField = 'name' | 'price' | 'stock' | 'createdAt' | 'updatedAt';

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
  sortBy: ProductSortField;
  sortOrder: 'asc' | 'desc';
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
}
