import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CategoriesRepository, CategoryRecord } from '../categories/repositories/categories.repository.js';
import { CategoriesService } from '../categories/categories.service.js';
import { ProductsService } from './products.service.js';
import type {
  CreateProductInput,
  ProductListFilter,
  ProductListResult,
  ProductRecord,
  ProductsRepository,
  UpdateProductInput,
} from './repositories/products.repository.js';

const CATEGORY: CategoryRecord = {
  id: '64b7f1c2a1b2c3d4e5f60001',
  name: 'Audio',
  slug: 'audio',
  image: null,
  parentId: null,
  displayOrder: 0,
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const INACTIVE: CategoryRecord = {
  ...CATEGORY,
  id: '64b7f1c2a1b2c3d4e5f60002',
  name: 'Legacy',
  slug: 'legacy',
  status: 'inactive',
};

/** Minimal in-memory repository; only the behaviour under test is modelled. */
class FakeProductsRepository implements ProductsRepository {
  readonly products = new Map<string, ProductRecord>();
  orderReferences = 0;
  private sequence = 0;

  async create(input: CreateProductInput): Promise<ProductRecord | null> {
    const record: ProductRecord = {
      ...input,
      // 24 hex chars: the service validates ids with the ObjectId pattern.
      id: (++this.sequence).toString(16).padStart(24, '0'),
      salePrice: input.salePrice ?? null,
      costPrice: input.costPrice ?? null,
      images: input.images.map((image) => ({
        url: image.url,
        publicId: image.publicId,
        alt: image.alt,
        isPrimary: image.isPrimary ?? false,
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.products.set(record.id, record);

    return record;
  }

  async findById(id: string): Promise<ProductRecord | null> {
    return this.products.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<ProductRecord | null> {
    return [...this.products.values()].find((item) => item.slug === slug) ?? null;
  }

  async update(id: string, input: UpdateProductInput): Promise<ProductRecord | null> {
    const existing = this.products.get(id);

    if (!existing) {
      return null;
    }

    const updated = { ...existing, ...input, updatedAt: new Date() } as ProductRecord;
    this.products.set(id, updated);

    return updated;
  }

  async list(filter: ProductListFilter): Promise<ProductListResult> {
    const items = [...this.products.values()].filter(
      (item) => !filter.status || item.status === filter.status,
    );

    return { items, total: items.length };
  }

  async delete(id: string): Promise<boolean> {
    return this.products.delete(id);
  }

  async existsBySku(sku: string): Promise<boolean> {
    return [...this.products.values()].some((item) => item.sku === sku);
  }

  async existsBySlug(slug: string): Promise<boolean> {
    return [...this.products.values()].some((item) => item.slug === slug);
  }

  async countOrderReferences(): Promise<number> {
    return this.orderReferences;
  }
}

class FakeCategoriesRepository implements CategoriesRepository {
  constructor(private readonly categories: CategoryRecord[]) {}

  async list() {
    return this.categories;
  }

  async findById(id: string) {
    return this.categories.find((category) => category.id === id) ?? null;
  }

  async findBySlug(slug: string) {
    return this.categories.find((category) => category.slug === slug) ?? null;
  }

  async create(): Promise<CategoryRecord> {
    throw new Error('not needed in this spec');
  }

  async countAll() {
    return this.categories.length;
  }

  // Admin-only members: the products service never calls them, they exist to
  // satisfy the abstract contract.
  async listPage() {
    return { items: this.categories, total: this.categories.length };
  }

  async update() {
    return null;
  }

  async delete() {
    return false;
  }

  async existsByNameUnderParent() {
    return false;
  }

  async existsBySlug() {
    return false;
  }

  async countChildren() {
    return 0;
  }

  async countProducts() {
    return new Map<string, number>();
  }
}

const baseProduct = {
  name: 'Wireless Headphones',
  description: 'A detailed enough description for validation.',
  sku: 'sku-au-1001',
  categoryId: CATEGORY.id,
  price: 249_900,
  salePrice: 199_900,
  costPrice: 150_000,
  stock: 10,
  lowStockThreshold: 3,
  status: 'draft' as const,
};

describe('ProductsService', () => {
  let repository: FakeProductsRepository;
  let service: ProductsService;

  beforeEach(() => {
    repository = new FakeProductsRepository();
    service = new ProductsService(
      repository,
      new CategoriesService(new FakeCategoriesRepository([CATEGORY, INACTIVE])),
    );
  });

  describe('create', () => {
    it('normalises SKU casing and derives the slug from the name', async () => {
      const created = await service.create(baseProduct);

      expect(created.sku).toBe('SKU-AU-1001');
      expect(created.slug).toBe('wireless-headphones');
      expect(created.category).toMatchObject({ id: CATEGORY.id, name: 'Audio' });
      expect(created.effectivePrice).toBe(199_900);
    });

    it('suffixes a derived slug that is already taken', async () => {
      await service.create(baseProduct);
      const second = await service.create({ ...baseProduct, sku: 'SKU-AU-1002' });

      expect(second.slug).toBe('wireless-headphones-2');
    });

    it('rejects a sale price that is not strictly below the regular price', async () => {
      await expect(
        service.create({ ...baseProduct, salePrice: 249_900 }),
      ).rejects.toThrow(/lower than the regular price/i);
    });

    it('accepts a product without a sale price', async () => {
      const created = await service.create({ ...baseProduct, salePrice: undefined });

      expect(created.salePrice).toBeNull();
      expect(created.effectivePrice).toBe(249_900);
    });

    it('rejects a duplicate SKU with 409 semantics', async () => {
      await service.create(baseProduct);

      await expect(service.create({ ...baseProduct })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects an inactive category when publishing', async () => {
      await expect(
        service.create({ ...baseProduct, categoryId: INACTIVE.id, status: 'published' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows an inactive category for a draft', async () => {
      const created = await service.create({
        ...baseProduct,
        categoryId: INACTIVE.id,
      });

      expect(created.category?.name).toBe('Legacy');
    });

    it('rejects an unknown category', async () => {
      await expect(
        service.create({ ...baseProduct, categoryId: '64b7f1c2a1b2c3d4e5f60009' }),
      ).rejects.toThrow(/category does not exist/i);
    });
  });

  describe('image rules', () => {
    it('keeps exactly one primary image and drops duplicates', async () => {
      const created = await service.create({
        ...baseProduct,
        images: [
          { url: 'https://cdn.example.com/a.jpg', isPrimary: true },
          { url: 'https://cdn.example.com/a.jpg' },
          { url: 'https://cdn.example.com/b.jpg' },
        ],
      });

      expect(created.images).toHaveLength(2);
      expect(created.images.filter((image) => image.isPrimary)).toHaveLength(1);
      expect(created.images[0].isPrimary).toBe(true);
    });

    it('promotes the first image when none is marked primary', async () => {
      const created = await service.create({
        ...baseProduct,
        images: [{ url: 'a.jpg' }, { url: 'b.jpg' }],
      });

      expect(created.images[0].isPrimary).toBe(true);
      expect(created.images[1].isPrimary).toBe(false);
    });

    it('caps the gallery at eight images', async () => {
      const created = await service.create({
        ...baseProduct,
        images: Array.from({ length: 12 }, (_, index) => ({ url: `${index}.jpg` })),
      });

      expect(created.images).toHaveLength(8);
    });
  });

  describe('public projection', () => {
    it('never exposes the internal cost price', async () => {
      const created = await service.create({ ...baseProduct, status: 'published' });
      const publicView = await service.getPublic(created.slug);

      expect(publicView).not.toHaveProperty('costPrice');
      expect(publicView.price).toBe(249_900);
      expect(publicView.inStock).toBe(true);
    });

    it('hides drafts from the storefront', async () => {
      const created = await service.create(baseProduct);

      await expect(service.getPublic(created.slug)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('status and deletion', () => {
    it('updates status and refuses to publish into an inactive category', async () => {
      const created = await service.create(baseProduct);

      const published = await service.changeStatus(created.id, 'published');
      expect(published.status).toBe('published');

      await repository.update(created.id, { categoryId: INACTIVE.id });
      await expect(
        service.changeStatus(created.id, 'published'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deletes a product with no order history', async () => {
      const created = await service.create(baseProduct);
      const result = await service.remove(created.id);

      expect(result).toMatchObject({ deleted: true, archived: false });
      expect(repository.products.size).toBe(0);
    });

    it('archives instead of deleting when orders reference the product', async () => {
      const created = await service.create(baseProduct);
      repository.orderReferences = 2;

      const result = await service.remove(created.id);

      expect(result).toMatchObject({
        deleted: false,
        archived: true,
        referencedOrders: 2,
      });
      expect(repository.products.get(created.id)?.status).toBe('archived');
    });

    it('returns 404 semantics for an unknown product', async () => {
      await expect(
        service.getForAdmin('64b7f1c2a1b2c3d4e5f60009'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
