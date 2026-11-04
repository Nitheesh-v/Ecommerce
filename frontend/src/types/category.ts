export type CategoryStatus = "active" | "inactive";
export type CategorySortField = "name" | "displayOrder" | "createdAt";

export interface CategoryImage {
  url: string;
  publicId?: string;
  alt?: string;
}

/** Minimal reference used for parents, siblings and breadcrumbs. */
export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

/** Admin projection: the stored record plus the counts the console shows. */
export interface AdminCategory extends CategoryRef {
  description?: string;
  image: CategoryImage | null;
  parentId: string | null;
  parent: CategoryRef | null;
  /** `Electronics › Mobiles` (empty for a root category). */
  parentPath: string;
  displayOrder: number;
  status: CategoryStatus;
  seoTitle?: string;
  seoDescription?: string;
  productCount: number;
  childrenCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Storefront projection: active categories only, nested. */
export interface CategoryNode extends CategoryRef {
  description?: string;
  image: CategoryImage | null;
  displayOrder: number;
  productCount: number;
  /** Public SEO metadata, rendered into the page's meta tags. */
  seoTitle?: string;
  seoDescription?: string;
  children: CategoryNode[];
}

export interface CategoryPageView extends Omit<CategoryNode, "children"> {
  breadcrumb: CategoryRef[];
  children: CategoryNode[];
  siblings: CategoryRef[];
}

export interface CategoryListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: CategoryStatus;
  /** `root` = top-level only; a category id = that category's children. */
  parentId?: string;
  sortBy?: CategorySortField;
  sortOrder?: "asc" | "desc";
}

export interface CategoryWritePayload {
  name: string;
  slug?: string;
  description?: string;
  image?: CategoryImage | null;
  parentId?: string | null;
  displayOrder?: number;
  status?: CategoryStatus;
  seoTitle?: string;
  seoDescription?: string;
}

export interface DeleteCategoryResult {
  deleted: true;
}
