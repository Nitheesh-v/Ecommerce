export type ProductStatus = "draft" | "published" | "archived";
export type StockStatus = "in" | "low" | "out";
export type ProductSortField = "name" | "price" | "stock" | "createdAt" | "updatedAt";

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
}

export interface Category extends CategorySummary {
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  url: string;
  publicId?: string;
  alt?: string;
  isPrimary: boolean;
}

/** Admin projection — the only shape that carries `costPrice`. */
export interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  shortDescription?: string;
  description: string;
  sku: string;
  categoryId: string;
  category: CategorySummary | null;
  brand?: string;
  /** Minor units (paise). */
  price: number;
  salePrice?: number | null;
  costPrice?: number | null;
  effectivePrice: number;
  stock: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
  status: ProductStatus;
  isFeatured: boolean;
  images: ProductImage[];
  seoTitle?: string;
  seoDescription?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductListQuery {
  page: number;
  limit: number;
  search?: string;
  category?: string;
  status?: ProductStatus;
  stockStatus?: StockStatus;
  sortBy?: ProductSortField;
  sortOrder?: "asc" | "desc";
}

export interface ProductWritePayload {
  name: string;
  slug?: string;
  shortDescription?: string;
  description: string;
  sku: string;
  categoryId: string;
  brand?: string;
  price: number;
  salePrice?: number | null;
  costPrice?: number | null;
  /**
   * Opening stock — **create only**. The API rejects `stock` on update, so a
   * quantity change always goes through the audited inventory adjustment endpoint.
   */
  stock?: number;
  lowStockThreshold: number;
  status: ProductStatus;
  isFeatured: boolean;
  images: ProductImage[];
  seoTitle?: string;
  seoDescription?: string;
}

export interface UploadedImage {
  url: string;
  publicId: string;
  provider: "local" | "cloudinary";
  width?: number;
  height?: number;
}

export interface DeleteProductResult {
  deleted: boolean;
  archived: boolean;
  referencedOrders: number;
  message: string;
}
