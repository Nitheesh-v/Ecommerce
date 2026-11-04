import { randomBytes } from 'node:crypto';
import type {
  CreateProductInput,
  ProductListFilter,
  ProductListResult,
  ProductRecord,
  ProductsRepository,
  UpdateProductInput,
} from '../../src/modules/products/repositories/products.repository.js';

/**
 * In-memory products repository.
 *
 * The filtering/sorting/pagination below deliberately mirrors
 * `MongooseProductsRepository.list()` so the service and the HTTP contracts are
 * exercised without a database. Order references are tracked separately to test
 * the archive-instead-of-delete rule without an `orders` collection.
 */
export class InMemoryProductsRepository implements ProductsRepository {
  private readonly products = new Map<string, ProductRecord>();
  private readonly orderReferences = new Map<string, number>();

  seed(input: CreateProductInput & { id?: string }): ProductRecord {
    const now = new Date();
    const record: ProductRecord = {
      id: input.id ?? newObjectIdLike(),
      name: input.name,
      slug: input.slug,
      shortDescription: input.shortDescription,
      description: input.description,
      sku: input.sku.toUpperCase(),
      categoryId: input.categoryId,
      brand: input.brand,
      price: input.price,
      salePrice: input.salePrice ?? null,
      costPrice: input.costPrice ?? null,
      stock: input.stock,
      lowStockThreshold: input.lowStockThreshold,
      status: input.status,
      isFeatured: input.isFeatured,
      images: input.images.map((image) => ({
        url: image.url,
        publicId: image.publicId,
        alt: image.alt,
        isPrimary: image.isPrimary ?? false,
      })),
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      createdAt: now,
      updatedAt: now,
    };

    this.products.set(record.id, record);

    return record;
  }

  /** How many products reference this category (used for category product counts). */
  countInCategory(categoryId: string): number {
    return [...this.products.values()].filter(
      (product) => product.categoryId === categoryId,
    ).length;
  }

  /** Simulates an order that contains this product in its items. */
  addOrderReference(productId: string, orders = 1): void {
    this.orderReferences.set(productId, orders);
  }

  async create(input: CreateProductInput): Promise<ProductRecord | null> {
    if (await this.existsBySku(input.sku)) {
      return null;
    }

    if (await this.existsBySlug(input.slug)) {
      return null;
    }

    return this.seed(input);
  }

  async findById(id: string): Promise<ProductRecord | null> {
    return this.products.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<ProductRecord | null> {
    return (
      [...this.products.values()].find(
        (product) => product.slug === slug.toLowerCase(),
      ) ?? null
    );
  }

  async update(
    id: string,
    input: UpdateProductInput,
  ): Promise<ProductRecord | null> {
    const existing = this.products.get(id);

    if (!existing) {
      return null;
    }

    if (input.sku && (await this.existsBySku(input.sku, id))) {
      return null;
    }

    if (input.slug && (await this.existsBySlug(input.slug, id))) {
      return null;
    }

    const updated: ProductRecord = {
      ...existing,
      ...Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined),
      ),
      sku: input.sku ? input.sku.toUpperCase() : existing.sku,
      images: input.images
        ? input.images.map((image) => ({
            url: image.url,
            publicId: image.publicId,
            alt: image.alt,
            isPrimary: image.isPrimary ?? false,
          }))
        : existing.images,
      updatedAt: new Date(),
    };

    this.products.set(id, updated);

    return updated;
  }

  async list(filter: ProductListFilter): Promise<ProductListResult> {
    const search = filter.search?.trim().toLowerCase();

    const matches = [...this.products.values()].filter((product) => {
      if (filter.status && product.status !== filter.status) return false;
      if (filter.categoryId && product.categoryId !== filter.categoryId) return false;
      if (filter.isFeatured !== undefined && product.isFeatured !== filter.isFeatured) {
        return false;
      }

      if (filter.stockStatus === 'in' && product.stock <= 0) return false;
      if (filter.stockStatus === 'out' && product.stock > 0) return false;
      // "low" means running low but not yet empty — out-of-stock is its own filter.
      if (
        filter.stockStatus === 'low' &&
        (product.stock <= 0 || product.stock > product.lowStockThreshold)
      ) {
        return false;
      }

      if (search) {
        const haystack = `${product.name} ${product.sku} ${product.slug}`.toLowerCase();

        if (!haystack.includes(search)) return false;
      }

      return true;
    });

    const direction = filter.sortOrder === 'asc' ? 1 : -1;
    const sorted = matches.sort((a, b) => {
      const left = a[filter.sortBy];
      const right = b[filter.sortBy];

      if (left instanceof Date && right instanceof Date) {
        return (left.getTime() - right.getTime()) * direction;
      }

      if (typeof left === 'string' && typeof right === 'string') {
        return left.localeCompare(right) * direction;
      }

      return (Number(left) - Number(right)) * direction;
    });

    const start = (filter.page - 1) * filter.limit;

    return {
      items: sorted.slice(start, start + filter.limit),
      total: sorted.length,
    };
  }

  async delete(id: string): Promise<boolean> {
    return this.products.delete(id);
  }

  async existsBySku(sku: string, excludeId?: string): Promise<boolean> {
    const normalized = sku.toUpperCase();

    return [...this.products.values()].some(
      (product) => product.sku === normalized && product.id !== excludeId,
    );
  }

  async existsBySlug(slug: string, excludeId?: string): Promise<boolean> {
    const normalized = slug.toLowerCase();

    return [...this.products.values()].some(
      (product) => product.slug === normalized && product.id !== excludeId,
    );
  }

  async countOrderReferences(productId: string): Promise<number> {
    return this.orderReferences.get(productId) ?? 0;
  }
}

/** 24 hex chars, the same shape as a MongoDB ObjectId. */
function newObjectIdLike(): string {
  return randomBytes(12).toString('hex');
}
