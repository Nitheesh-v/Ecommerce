import { randomBytes } from 'node:crypto';
import type {
  CategoriesRepository,
  CategoryImageRecord,
  CategoryListQuery,
  CategoryListResult,
  CategoryRecord,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../../src/modules/categories/repositories/categories.repository.js';
import type { CategoryStatus } from '../../src/modules/categories/schemas/category.schema.js';

/** ObjectId-shaped id: DTOs validate `parentId` with `@IsMongoId`. */
function newObjectIdLike(): string {
  return randomBytes(12).toString('hex');
}

interface InMemoryCategoriesOptions {
  /**
   * Product counts come from the products repository, not from this map.
   * Passing a provider keeps the two fakes consistent in e2e tests.
   */
  productCounts?: (categoryId: string) => number;
}

/**
 * In-memory categories.
 *
 * Mirrors the rules the Mongo implementation relies on:
 * - slug is unique (case-insensitive);
 * - sibling names are unique, names under different parents may repeat;
 * - listing supports search, status/parent filters, sorting and pagination.
 */
export class InMemoryCategoriesRepository implements CategoriesRepository {
  private readonly categories = new Map<string, CategoryRecord>();

  constructor(private readonly options: InMemoryCategoriesOptions = {}) {}

  seed(input: CreateCategoryInput & { id?: string }): CategoryRecord {
    const now = new Date();
    const record: CategoryRecord = {
      id: input.id ?? newObjectIdLike(),
      name: input.name,
      slug: input.slug.toLowerCase(),
      description: input.description,
      image: (input.image as CategoryImageRecord | undefined) ?? null,
      parentId: input.parentId ?? null,
      displayOrder: input.displayOrder ?? 0,
      status: input.status ?? 'active',
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      createdAt: now,
      updatedAt: now,
    };

    this.categories.set(record.id, record);

    return record;
  }

  async list(status?: CategoryStatus): Promise<CategoryRecord[]> {
    return [...this.categories.values()]
      .filter((category) => (status ? category.status === status : true))
      .sort(byDisplayOrder);
  }

  async listPage(query: CategoryListQuery): Promise<CategoryListResult> {
    const search = query.search?.toLowerCase();
    const matches = [...this.categories.values()].filter((category) => {
      if (query.status && category.status !== query.status) {
        return false;
      }

      if (query.parentId === 'root' && category.parentId !== null) {
        return false;
      }

      if (
        query.parentId &&
        query.parentId !== 'root' &&
        category.parentId !== query.parentId
      ) {
        return false;
      }

      if (search) {
        const haystack = `${category.name} ${category.slug}`.toLowerCase();

        if (!haystack.includes(search)) {
          return false;
        }
      }

      return true;
    });

    const direction = query.sortOrder === 'asc' ? 1 : -1;
    const sorted = matches.sort((a, b) => {
      if (query.sortBy === 'name') {
        return a.name.localeCompare(b.name) * direction || a.id.localeCompare(b.id);
      }

      if (query.sortBy === 'createdAt') {
        return (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
      }

      return (
        (a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)) * direction
      );
    });

    const start = (query.page - 1) * query.limit;

    return {
      items: sorted.slice(start, start + query.limit),
      total: sorted.length,
    };
  }

  async findById(id: string): Promise<CategoryRecord | null> {
    return this.categories.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<CategoryRecord | null> {
    return (
      [...this.categories.values()].find(
        (category) => category.slug === slug.toLowerCase(),
      ) ?? null
    );
  }

  async create(input: CreateCategoryInput): Promise<CategoryRecord> {
    if (await this.existsBySlug(input.slug)) {
      throw new Error('duplicate category slug');
    }

    return this.seed(input);
  }

  async update(
    id: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryRecord | null> {
    const existing = this.categories.get(id);

    if (!existing) {
      return null;
    }

    const updated: CategoryRecord = {
      ...existing,
      ...input,
      image: input.image === undefined ? existing.image : input.image,
      parentId: input.parentId === undefined ? existing.parentId : input.parentId,
      updatedAt: new Date(),
    } as CategoryRecord;

    this.categories.set(id, updated);

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.categories.delete(id);
  }

  async existsByNameUnderParent(
    name: string,
    parentId: string | null,
    excludeId?: string,
  ): Promise<boolean> {
    const needle = name.trim().toLowerCase();

    return [...this.categories.values()].some(
      (category) =>
        category.id !== excludeId &&
        (category.parentId ?? null) === (parentId ?? null) &&
        category.name.toLowerCase() === needle,
    );
  }

  async existsBySlug(slug: string, excludeId?: string): Promise<boolean> {
    return [...this.categories.values()].some(
      (category) =>
        category.id !== excludeId && category.slug === slug.toLowerCase(),
    );
  }

  async countChildren(parentId: string): Promise<number> {
    return [...this.categories.values()].filter(
      (category) => category.parentId === parentId,
    ).length;
  }

  async countProducts(categoryIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    for (const id of categoryIds) {
      const count = this.options.productCounts?.(id) ?? 0;

      if (count > 0) {
        counts.set(id, count);
      }
    }

    return counts;
  }

  async countAll(): Promise<number> {
    return this.categories.size;
  }
}

function byDisplayOrder(a: CategoryRecord, b: CategoryRecord): number {
  return a.displayOrder - b.displayOrder || a.name.localeCompare(b.name);
}
