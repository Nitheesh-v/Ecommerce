import type { CategoryStatus } from '../schemas/category.schema.js';

export interface CategoryImageRecord {
  url: string;
  publicId?: string;
  alt?: string;
}

export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  description?: string;
  image: CategoryImageRecord | null;
  /** `null` for a root category. */
  parentId: string | null;
  displayOrder: number;
  status: CategoryStatus;
  seoTitle?: string;
  seoDescription?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CategorySortField = 'name' | 'displayOrder' | 'createdAt';

/** `'root'` selects top-level categories; an id selects that category's children. */
export type CategoryParentFilter = string | null | 'root';

export interface CategoryListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: CategoryStatus;
  parentId?: CategoryParentFilter;
  sortBy: CategorySortField;
  sortOrder: 'asc' | 'desc';
}

export interface CategoryListResult {
  items: CategoryRecord[];
  total: number;
}

export interface CreateCategoryInput {
  name: string;
  slug: string;
  description?: string;
  image?: CategoryImageRecord | null;
  parentId?: string | null;
  displayOrder?: number;
  status?: CategoryStatus;
  seoTitle?: string;
  seoDescription?: string;
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

/**
 * Persistence boundary for categories.
 *
 * Abstract class = Nest DI token, so the service and the HTTP layer can be tested
 * against an in-memory implementation without a database (see
 * `backend/test/support/in-memory-categories.repository.ts`).
 *
 * Every method that can be affected by concurrency returns the stored state
 * instead of a boolean, so the service can answer with the real record.
 */
export abstract class CategoriesRepository {
  /**
   * Unpaged list used by other modules (products need every category to resolve
   * names and statuses). Kept separate from `listPage` on purpose.
   */
  abstract list(status?: CategoryStatus): Promise<CategoryRecord[]>;

  /** Paginated, filtered, sorted admin listing. */
  abstract listPage(query: CategoryListQuery): Promise<CategoryListResult>;

  abstract findById(id: string): Promise<CategoryRecord | null>;

  abstract findBySlug(slug: string): Promise<CategoryRecord | null>;

  abstract create(input: CreateCategoryInput): Promise<CategoryRecord>;

  /** Returns `null` when the id does not exist. */
  abstract update(id: string, input: UpdateCategoryInput): Promise<CategoryRecord | null>;

  abstract delete(id: string): Promise<boolean>;

  /**
   * Sibling-name rule: two categories may share a name as long as they sit under
   * different parents. `excludeId` lets an update ignore the record itself.
   */
  abstract existsByNameUnderParent(
    name: string,
    parentId: string | null,
    excludeId?: string,
  ): Promise<boolean>;

  abstract existsBySlug(slug: string, excludeId?: string): Promise<boolean>;

  abstract countChildren(parentId: string): Promise<number>;

  /** Product count per category id (missing ids = zero). */
  abstract countProducts(categoryIds: string[]): Promise<Map<string, number>>;

  abstract countAll(): Promise<number>;
}
