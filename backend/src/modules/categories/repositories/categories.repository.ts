import type { CategoryStatus } from '../schemas/category.schema.js';

export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  status: CategoryStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCategoryInput {
  name: string;
  slug: string;
  status?: CategoryStatus;
}

/**
 * Read/write boundary for categories.
 *
 * Abstract class = Nest DI token. The product module depends on this contract
 * only, so e2e tests can supply an in-memory implementation and never touch a
 * database.
 */
export abstract class CategoriesRepository {
  abstract list(status?: CategoryStatus): Promise<CategoryRecord[]>;

  abstract findById(id: string): Promise<CategoryRecord | null>;

  abstract findBySlug(slug: string): Promise<CategoryRecord | null>;

  abstract create(input: CreateCategoryInput): Promise<CategoryRecord>;

  abstract countAll(): Promise<number>;
}
