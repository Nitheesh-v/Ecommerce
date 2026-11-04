import { randomUUID } from 'node:crypto';
import type {
  CategoriesRepository,
  CategoryRecord,
  CreateCategoryInput,
} from '../../src/modules/categories/repositories/categories.repository.js';
import type { CategoryStatus } from '../../src/modules/categories/schemas/category.schema.js';

/** In-memory categories, mirroring the unique-slug rule of the Mongo index. */
export class InMemoryCategoriesRepository implements CategoriesRepository {
  private readonly categories = new Map<string, CategoryRecord>();

  seed(input: CreateCategoryInput & { id?: string }): CategoryRecord {
    const now = new Date();
    const record: CategoryRecord = {
      id: input.id ?? randomUUID(),
      name: input.name,
      slug: input.slug.toLowerCase(),
      status: input.status ?? 'active',
      createdAt: now,
      updatedAt: now,
    };

    this.categories.set(record.id, record);

    return record;
  }

  async list(status?: CategoryStatus): Promise<CategoryRecord[]> {
    return [...this.categories.values()]
      .filter((category) => (status ? category.status === status : true))
      .sort((a, b) => a.name.localeCompare(b.name));
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
    const existing = await this.findBySlug(input.slug);

    if (existing) {
      throw new Error('duplicate category slug');
    }

    return this.seed(input);
  }

  async countAll(): Promise<number> {
    return this.categories.size;
  }
}
