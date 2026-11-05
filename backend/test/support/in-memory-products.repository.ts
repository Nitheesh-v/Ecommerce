import { randomBytes } from 'node:crypto';
import type {
  CreateProductInput,
  ProductFacets,
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
      ratingAverage: 0,
      ratingCount: 0,
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

  /**
   * Test hook for the in-memory inventory repository: applies a guarded stock
   * change the way the Mongo `findOneAndUpdate` does — one synchronous
   * read-modify-write, so a running total can never drift.
   *
   * `update` returns `null` to reject the change (e.g. not enough stock).
   */
  mutateStock(
    id: string,
    update: (stock: number) => number | null,
  ): { before: number; product: ProductRecord } | null {
    const product = this.products.get(id);
    if (!product) {
      return null;
    }

    const before = product.stock;
    const next = update(before);
    if (next === null || next < 0) {
      return null;
    }

    product.stock = next;
    product.updatedAt = new Date();

    return { before, product: { ...product } };
  }

  /** Test hook: empties the store (inventory specs reseed per test). */
  reset(): void {
    this.products.clear();
    this.orderReferences.clear();
  }

  /** Read-only snapshot for inventory aggregations. */
  all(): ProductRecord[] {
    return [...this.products.values()].map((product) => ({ ...product }));
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

  async updateRating(
    productId: string,
    average: number,
    count: number,
  ): Promise<void> {
    const existing = this.products.get(productId);

    if (!existing) {
      return;
    }

    this.products.set(productId, {
      ...existing,
      ratingAverage: average,
      ratingCount: count,
    });
  }

  async facets(): Promise<ProductFacets> {
    const published = [...this.products.values()].filter(
      (product) => product.status === 'published',
    );
    const effectivePrice = (product: ProductRecord) => product.salePrice ?? product.price;
    const prices = published.map(effectivePrice);

    const byCategory = new Map<string, { count: number; minPrice: number; maxPrice: number }>();

    for (const product of published) {
      const price = effectivePrice(product);
      const current = byCategory.get(product.categoryId);

      byCategory.set(product.categoryId, {
        count: (current?.count ?? 0) + 1,
        minPrice: Math.min(current?.minPrice ?? price, price),
        maxPrice: Math.max(current?.maxPrice ?? price, price),
      });
    }

    return {
      total: published.length,
      categories: [...byCategory.entries()].map(([categoryId, stats]) => ({
        categoryId,
        ...stats,
      })),
      price: {
        min: prices.length > 0 ? Math.min(...prices) : 0,
        max: prices.length > 0 ? Math.max(...prices) : 0,
      },
      ratings: [
        { min: 4, count: published.filter((product) => product.ratingAverage >= 4).length },
        { min: 3, count: published.filter((product) => product.ratingAverage >= 3).length },
      ],
      inStock: published.filter((product) => product.stock > 0).length,
      onSale: published.filter(
        (product) =>
          product.salePrice !== null &&
          product.salePrice !== undefined &&
          product.salePrice < product.price,
      ).length,
    };
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

      // Storefront filters compare the price the customer actually pays.
      const effectivePrice = product.salePrice ?? product.price;

      if (filter.minPrice !== undefined && effectivePrice < filter.minPrice) return false;
      if (filter.maxPrice !== undefined && effectivePrice > filter.maxPrice) return false;
      if (filter.inStock && product.stock <= 0) return false;
      if (
        filter.onSale &&
        (product.salePrice === null ||
          product.salePrice === undefined ||
          product.salePrice >= product.price)
      ) {
        return false;
      }
      if (filter.minRating !== undefined && product.ratingAverage < filter.minRating) {
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
    // "Highest rated" breaks ties by how many ratings back the average.
    const sortKey = (product: ProductRecord): string | number | Date =>
      filter.sortBy === 'rating' ? product.ratingAverage : product[filter.sortBy];
    const sorted = matches.sort((a, b) => {
      const left = sortKey(a);
      const right = sortKey(b);

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
