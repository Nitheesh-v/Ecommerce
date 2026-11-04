import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { CategoriesService } from './categories.service.js';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type {
  CategoriesRepository,
  CategoryListQuery,
  CategoryRecord,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './repositories/categories.repository.js';

/**
 * Minimal in-memory repository.
 *
 * Only the behaviour the service relies on is modelled: unique slugs, sibling
 * scoping and parent lookups. Pagination/search are covered by the e2e suite
 * against the real query semantics.
 */
class FakeCategoriesRepository implements CategoriesRepository {
  readonly categories = new Map<string, CategoryRecord>();
  readonly productCounts = new Map<string, number>();
  private sequence = 0;

  async list(status?: 'active' | 'inactive') {
    return [...this.categories.values()].filter((category) =>
      status ? category.status === status : true,
    );
  }

  async listPage(query: CategoryListQuery) {
    const items = [...this.categories.values()].filter(
      (category) =>
        query.parentId === undefined ||
        (query.parentId === 'root'
          ? category.parentId === null
          : category.parentId === query.parentId),
    );

    return { items, total: items.length };
  }

  async findById(id: string) {
    return this.categories.get(id) ?? null;
  }

  async findBySlug(slug: string) {
    return (
      [...this.categories.values()].find((category) => category.slug === slug) ??
      null
    );
  }

  async create(input: CreateCategoryInput) {
    // 24 hex chars: the service and DTOs treat ids as ObjectIds.
    const id = (++this.sequence).toString(16).padStart(24, '0');
    const now = new Date();
    const record: CategoryRecord = {
      id,
      name: input.name,
      slug: input.slug,
      description: input.description,
      image: input.image ?? null,
      parentId: input.parentId ?? null,
      displayOrder: input.displayOrder ?? 0,
      status: input.status ?? 'active',
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      createdAt: now,
      updatedAt: now,
    };

    this.categories.set(id, record);

    return record;
  }

  async update(id: string, input: UpdateCategoryInput) {
    const existing = this.categories.get(id);

    if (!existing) {
      return null;
    }

    const updated = { ...existing, ...input, updatedAt: new Date() } as CategoryRecord;
    this.categories.set(id, updated);

    return updated;
  }

  async delete(id: string) {
    return this.categories.delete(id);
  }

  async existsByNameUnderParent(
    name: string,
    parentId: string | null,
    excludeId?: string,
  ) {
    return [...this.categories.values()].some(
      (category) =>
        category.id !== excludeId &&
        category.parentId === parentId &&
        category.name.toLowerCase() === name.toLowerCase(),
    );
  }

  async existsBySlug(slug: string, excludeId?: string) {
    return [...this.categories.values()].some(
      (category) => category.id !== excludeId && category.slug === slug,
    );
  }

  async countChildren(parentId: string) {
    return [...this.categories.values()].filter(
      (category) => category.parentId === parentId,
    ).length;
  }

  async countProducts(ids: string[]) {
    const counts = new Map<string, number>();

    for (const id of ids) {
      const count = this.productCounts.get(id) ?? 0;

      if (count > 0) {
        counts.set(id, count);
      }
    }

    return counts;
  }

  async countAll() {
    return this.categories.size;
  }
}

describe('CategoriesService', () => {
  let repository: FakeCategoriesRepository;
  let service: CategoriesService;

  beforeEach(() => {
    repository = new FakeCategoriesRepository();
    service = new CategoriesService(repository);
  });

  const create = (
    name: string,
    overrides: Omit<Partial<CreateCategoryDto>, 'name'> = {},
  ) => service.create({ name, ...overrides });

  describe('create', () => {
    it('derives the slug and defaults to an active root category', async () => {
      const created = await create('Men’s Clothing');

      expect(created).toMatchObject({
        name: 'Men’s Clothing',
        slug: "men-s-clothing",
        parentId: null,
        displayOrder: 0,
        status: 'active',
        productCount: 0,
        childrenCount: 0,
      });
    });

    it('suffixes a generated slug that is already taken', async () => {
      // Different names, identical slug: the name rule passes and the slug is
      // de-duplicated instead of failing the request.
      await create('Home & Kitchen');
      const second = await create('Home Kitchen');

      expect(second.slug).toBe('home-kitchen-2');
    });

    it('rejects a duplicate slug for the same level', async () => {
      await create('Shoes', { slug: 'shoes' });

      await expect(create('Trainers', { slug: 'shoes' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects a duplicate name under the same parent', async () => {
      const parent = await create('Fashion');
      await create('Tops', { parentId: parent.id });

      await expect(create('tops', { parentId: parent.id })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('allows the same name under a different parent', async () => {
      const men = await create('Men');
      const women = await create('Women');

      await create('Tops', { parentId: men.id });

      await expect(create('Tops', { parentId: women.id })).resolves.toMatchObject({
        parentId: women.id,
      });
    });

    it('rejects an unknown parent', async () => {
      await expect(
        create('Orphan', { parentId: '000000000000000000000001' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('hierarchy', () => {
    it('rejects a category being its own parent', async () => {
      const category = await create('Stationery');

      await expect(
        service.update(category.id, { parentId: category.id }),
      ).rejects.toThrow(/own parent/i);
    });

    it('rejects moving a category under its own descendant', async () => {
      const root = await create('Electronics');
      const child = await create('Mobiles', { parentId: root.id });

      await expect(
        service.update(root.id, { parentId: child.id }),
      ).rejects.toThrow(/own subcategories/i);
    });

    it('caps the tree at three levels', async () => {
      const one = await create('One');
      const two = await create('Two', { parentId: one.id });
      const three = await create('Three', { parentId: two.id });

      await expect(create('Four', { parentId: three.id })).rejects.toThrow(
        /at most 3 levels/i,
      );
    });

    it('moves a category back to the top level', async () => {
      const parent = await create('Parent');
      const child = await create('Child', { parentId: parent.id });

      await expect(
        service.update(child.id, { parentId: null }),
      ).resolves.toMatchObject({ parentId: null });
    });
  });

  describe('deletion guards', () => {
    it('refuses to delete a category that has children', async () => {
      const parent = await create('With Child');
      await create('Child', { parentId: parent.id });

      await expect(service.remove(parent.id)).rejects.toThrow(/subcategor/i);
    });

    it('refuses to delete a category that has products', async () => {
      const category = await create('With Products');
      repository.productCounts.set(category.id, 3);

      await expect(service.remove(category.id)).rejects.toThrow(/3 products/i);
    });

    it('deletes a leaf category', async () => {
      const category = await create('Leaf');

      await expect(service.remove(category.id)).resolves.toEqual({ deleted: true });
      expect(repository.categories.size).toBe(0);
    });
  });

  describe('storefront projection', () => {
    it('hides inactive categories', async () => {
      await create('Hidden', { status: 'inactive' });

      await expect(service.getPublicBySlug('hidden')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(await service.getPublicTree()).toHaveLength(0);
    });

    it('hides the children of an inactive parent', async () => {
      const parent = await create('Closed', { status: 'inactive' });
      await create('Child', { parentId: parent.id });

      await expect(service.getPublicBySlug('child')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('nests active children under their parent', async () => {
      const parent = await create('Shop');
      await create('Child', { parentId: parent.id });

      const tree = await service.getPublicTree();

      expect(tree).toHaveLength(1);
      expect(tree[0].children.map((child) => child.slug)).toEqual(['child']);
    });
  });

  describe('admin listing', () => {
    it('filters by parent and reports product counts', async () => {
      const parent = await create('Root');
      const child = await create('Child', { parentId: parent.id });
      await create('Other Root');
      repository.productCounts.set(child.id, 2);

      const roots = await service.listAdmin({
        page: 1,
        limit: 10,
        parentId: 'root',
        sortBy: 'name',
        sortOrder: 'asc',
      });

      expect(roots.data).toHaveLength(2);
      expect(roots.meta.total).toBe(2);

      const children = await service.listAdmin({
        page: 1,
        limit: 10,
        parentId: parent.id,
        sortBy: 'name',
        sortOrder: 'asc',
      });

      expect(children.data[0]).toMatchObject({ name: 'Child', productCount: 2 });
    });

    it('rejects an invalid parent filter', async () => {
      await expect(
        service.listAdmin({
          page: 1,
          limit: 10,
          parentId: 'nope',
          sortBy: 'name',
          sortOrder: 'asc',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
