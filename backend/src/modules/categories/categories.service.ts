import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
// Value import on purpose: `CategoriesRepository` is the DI token, and a
// type-only import erases it from `design:paramtypes` (Nest then can't inject).
import { CategoriesRepository } from './repositories/categories.repository.js';
import type {
  CategoryListQuery,
  CategoryRecord,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './repositories/categories.repository.js';
import { createPaginatedResult } from '../../common/utils/pagination.util.js';
import type { PaginatedResult } from '../../common/utils/pagination.util.js';
import type { CategoryStatus } from './schemas/category.schema.js';
import { slugify, uniqueSlug } from '../../common/utils/slug.util.js';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type { UpdateCategoryDto } from './dto/update-category.dto.js';

/**
 * How deep the tree may go. Three levels is what a storefront breadcrumb can
 * show without becoming unusable (Department → Category → Subcategory).
 */
export const MAX_CATEGORY_DEPTH = 3;

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

/** Compact reference used for parents and breadcrumbs. */
export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

/** Admin projection: the stored record plus the counts the table shows. */
export interface CategoryView extends CategoryRef {
  description?: string;
  image: { url: string; publicId?: string; alt?: string } | null;
  parentId: string | null;
  parent: CategoryRef | null;
  /** Human-readable ancestry, e.g. `Electronics › Mobiles`. */
  parentPath: string;
  displayOrder: number;
  status: CategoryStatus;
  seoTitle?: string;
  seoDescription?: string;
  productCount: number;
  childrenCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Storefront projection: never contains anything an anonymous visitor must not see. */
export interface CategoryNode extends CategoryRef {
  description?: string;
  image: { url: string; publicId?: string; alt?: string } | null;
  displayOrder: number;
  productCount: number;
  /** Public SEO metadata: it is rendered into the page's meta tags. */
  seoTitle?: string;
  seoDescription?: string;
  children: CategoryNode[];
}

export interface CategoryPageView extends Omit<CategoryNode, 'children'> {
  breadcrumb: CategoryRef[];
  children: CategoryNode[];
  siblings: CategoryRef[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  // ---------------------------------------------------------------- internal --
  // Used by ProductsService (assignments, name lookups). Keep this contract stable.

  /** Unpaged list, optionally filtered by status. */
  list(status?: CategoryStatus): Promise<CategoryRecord[]> {
    return this.categoriesRepository.list(status);
  }

  listActive(): Promise<CategoryRecord[]> {
    return this.categoriesRepository.list('active');
  }

  findById(id: string): Promise<CategoryRecord | null> {
    return this.categoriesRepository.findById(id);
  }

  async exists(id: string): Promise<boolean> {
    return (await this.categoriesRepository.findById(id)) !== null;
  }

  // ------------------------------------------------------------------ admin ---

  async listAdmin(query: CategoryListQuery): Promise<PaginatedResult<CategoryView>> {
    const parentFilter = this.parseParentFilter(query.parentId);
    const { items, total } = await this.categoriesRepository.listPage({
      ...query,
      parentId: parentFilter,
    });

    // One extra read for the whole page: names/paths and child counts.
    const all = await this.categoriesRepository.list();
    const products = await this.categoriesRepository.countProducts(
      all.map((category) => category.id),
    );
    const children = countChildrenByParent(all);

    return createPaginatedResult(
      items.map((category) => this.toView(category, all, products, children)),
      query.page,
      query.limit,
      total,
    );
  }

  async getAdmin(id: string): Promise<CategoryView> {
    const category = await this.require(id);
    const all = await this.categoriesRepository.list();
    const products = await this.categoriesRepository.countProducts(
      all.map((item) => item.id),
    );

    return this.toView(category, all, products, countChildrenByParent(all));
  }

  async create(dto: CreateCategoryDto): Promise<CategoryView> {
    const name = dto.name.trim();
    const parentId = await this.resolveParent(dto.parentId ?? null);

    await this.assertNameAvailable(name, parentId);
    const slug = await this.resolveSlug(dto.slug, name);

    const input: CreateCategoryInput = {
      name,
      slug,
      description: dto.description,
      image: dto.image ?? null,
      parentId,
      displayOrder: dto.displayOrder ?? 0,
      status: dto.status ?? 'active',
      seoTitle: dto.seoTitle,
      seoDescription: dto.seoDescription,
    };

    const created = await this.categoriesRepository.create(input);

    return this.getAdmin(created.id);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryView> {
    const existing = await this.require(id);

    // `parentId: null` is meaningful ("move to top level"), so presence is
    // checked with `in` rather than a truthiness test.
    const parentChanged = 'parentId' in dto;
    const parentId = parentChanged
      ? await this.resolveParent(dto.parentId ?? null, id)
      : existing.parentId;

    const name = dto.name?.trim() ?? existing.name;

    if (name !== existing.name || parentId !== existing.parentId) {
      await this.assertNameAvailable(name, parentId, id);
    }

    let slug = existing.slug;

    if (dto.slug && dto.slug !== existing.slug) {
      if (await this.categoriesRepository.existsBySlug(dto.slug, id)) {
        throw new ConflictException(`Slug "${dto.slug}" is already in use`);
      }

      slug = dto.slug.toLowerCase();
    }

    const input: UpdateCategoryInput = {
      name,
      slug,
      parentId,
      description: dto.description ?? existing.description,
      image: dto.image === undefined ? existing.image : dto.image,
      displayOrder: dto.displayOrder ?? existing.displayOrder,
      status: dto.status ?? existing.status,
      seoTitle: dto.seoTitle ?? existing.seoTitle,
      seoDescription: dto.seoDescription ?? existing.seoDescription,
    };

    const updated = await this.categoriesRepository.update(id, input);

    if (!updated) {
      throw new NotFoundException('Category not found');
    }

    return this.getAdmin(updated.id);
  }

  async changeStatus(id: string, status: CategoryStatus): Promise<CategoryView> {
    await this.require(id);

    const updated = await this.categoriesRepository.update(id, { status });

    if (!updated) {
      throw new NotFoundException('Category not found');
    }

    return this.getAdmin(updated.id);
  }

  /**
   * Deletes only when nothing depends on the category.
   *
   * Both guards return `409` with the counts so the admin UI can explain *why*
   * (reassign the products / move or delete the children first) instead of a
   * generic failure.
   */
  async remove(id: string): Promise<{ deleted: true }> {
    const category = await this.require(id);

    const childrenCount = await this.categoriesRepository.countChildren(id);

    if (childrenCount > 0) {
      throw new ConflictException({
        message: `"${category.name}" has ${childrenCount} subcategor${childrenCount === 1 ? 'y' : 'ies'}. Move or delete them first.`,
        details: { childrenCount },
      });
    }

    const products = await this.categoriesRepository.countProducts([id]);
    const productCount = products.get(id) ?? 0;

    if (productCount > 0) {
      throw new ConflictException({
        message: `"${category.name}" has ${productCount} product${productCount === 1 ? '' : 's'} assigned. Reassign them to another category first.`,
        details: { productCount },
      });
    }

    const deleted = await this.categoriesRepository.delete(id);

    if (!deleted) {
      throw new NotFoundException('Category not found');
    }

    return { deleted: true };
  }

  // -------------------------------------------------------------- storefront --

  /** Active categories nested by parent, in display order. */
  async getPublicTree(): Promise<CategoryNode[]> {
    const active = await this.categoriesRepository.list('active');
    const counts = await this.categoriesRepository.countProducts(
      active.map((category) => category.id),
    );
    const nodes = new Map<string, CategoryNode>();

    for (const category of active) {
      nodes.set(category.id, {
        ...toNode(category, counts.get(category.id) ?? 0),
        children: [],
      });
    }

    const roots: CategoryNode[] = [];

    for (const category of active) {
      const node = nodes.get(category.id);

      if (!node) {
        continue;
      }

      const parent = category.parentId ? nodes.get(category.parentId) : undefined;

      // A child of an inactive parent is not reachable in the storefront, so it
      // is not rendered at the top level either.
      if (category.parentId && !parent) {
        continue;
      }

      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    for (const node of nodes.values()) {
      node.children.sort(byDisplayOrder);
    }

    return roots.sort(byDisplayOrder);
  }

  /** Flat, active, ordered list (used by pickers that do not render a tree). */
  async getPublicList(parentSlug?: string): Promise<CategoryNode[]> {
    const active = await this.categoriesRepository.list('active');
    const counts = await this.categoriesRepository.countProducts(
      active.map((category) => category.id),
    );

    let visible = active;

    if (parentSlug) {
      const parent = active.find((category) => category.slug === parentSlug);

      if (!parent) {
        throw new NotFoundException('Category not found');
      }

      visible = active.filter((category) => category.parentId === parent.id);
    }

    return visible
      .sort(byDisplayOrder)
      .map((category) => ({
        ...toNode(category, counts.get(category.id) ?? 0),
        children: [],
      }));
  }

  /**
   * Storefront category page: the category, its active children, its siblings
   * (for lateral navigation) and a breadcrumb.
   *
   * Inactive categories — and active children of inactive parents — are 404s:
   * the storefront never advertises something the admin switched off.
   */
  async getPublicBySlug(slug: string): Promise<CategoryPageView> {
    const category = await this.categoriesRepository.findBySlug(slug);

    if (!category || category.status !== 'active') {
      throw new NotFoundException('Category not found');
    }

    const ancestors = await this.loadAncestors(category.parentId, { activeOnly: true });
    const active = await this.categoriesRepository.list('active');
    const counts = await this.categoriesRepository.countProducts(
      active.map((item) => item.id),
    );

    const children = active
      .filter((item) => item.parentId === category.id)
      .sort(byDisplayOrder)
      .map((item) => ({
        ...toNode(item, counts.get(item.id) ?? 0),
        children: [],
      }));

    const siblings = active
      .filter(
        (item) =>
          item.id !== category.id &&
          (item.parentId ?? null) === category.parentId,
      )
      .sort(byDisplayOrder)
      .map(toRef);

    return {
      ...toNode(category, counts.get(category.id) ?? 0),
      breadcrumb: ancestors.map(toRef),
      children,
      siblings,
    };
  }

  // ------------------------------------------------------------------ helpers --

  private async require(id: string): Promise<CategoryRecord> {
    if (!OBJECT_ID_PATTERN.test(id)) {
      throw new NotFoundException('Category not found');
    }

    const category = await this.categoriesRepository.findById(id);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  /**
   * Validates a proposed parent for `categoryId` (undefined when creating):
   * it must exist, it cannot be the category itself, it cannot be one of its own
   * descendants, and it must not push the tree past `MAX_CATEGORY_DEPTH`.
   */
  private async resolveParent(
    parentId: string | null,
    categoryId?: string,
  ): Promise<string | null> {
    if (!parentId) {
      return null;
    }

    if (categoryId && parentId === categoryId) {
      throw new BadRequestException('A category cannot be its own parent');
    }

    const parent = await this.categoriesRepository.findById(parentId);

    if (!parent) {
      throw new BadRequestException('Parent category does not exist');
    }

    if (categoryId) {
      const ancestors = await this.loadAncestors(parentId, { activeOnly: false });

      if (ancestors.some((ancestor) => ancestor.id === categoryId)) {
        throw new BadRequestException(
          'A category cannot be nested under one of its own subcategories',
        );
      }
    }

    const parentDepth = (await this.loadAncestors(parentId, { activeOnly: false }))
      .length;

    if (parentDepth + 1 > MAX_CATEGORY_DEPTH) {
      throw new BadRequestException(
        `Categories can be nested at most ${MAX_CATEGORY_DEPTH} levels deep`,
      );
    }

    return parent.id;
  }

  /** Walks `parentId` upwards. The visited set makes a corrupt cycle terminate. */
  private async loadAncestors(
    parentId: string | null,
    options: { activeOnly: boolean },
  ): Promise<CategoryRecord[]> {
    const ancestors: CategoryRecord[] = [];
    const visited = new Set<string>();
    let current = parentId;

    while (current && !visited.has(current)) {
      visited.add(current);

      const ancestor = await this.categoriesRepository.findById(current);

      if (!ancestor) {
        break;
      }

      if (options.activeOnly && ancestor.status !== 'active') {
        throw new NotFoundException('Category not found');
      }

      ancestors.unshift(ancestor);
      current = ancestor.parentId;
    }

    return ancestors;
  }

  /** Sibling names must be unique (case-insensitive); different parents may repeat. */
  private async assertNameAvailable(
    name: string,
    parentId: string | null,
    excludeId?: string,
  ): Promise<void> {
    const taken = await this.categoriesRepository.existsByNameUnderParent(
      name,
      parentId,
      excludeId,
    );

    if (taken) {
      throw new ConflictException(
        `A category named "${name}" already exists at this level`,
      );
    }
  }

  /** Explicit slugs collide loudly; generated ones are suffixed silently. */
  private async resolveSlug(
    explicitSlug: string | undefined,
    name: string,
  ): Promise<string> {
    if (explicitSlug) {
      if (await this.categoriesRepository.existsBySlug(explicitSlug)) {
        throw new ConflictException(`Slug "${explicitSlug}" is already in use`);
      }

      return explicitSlug.toLowerCase();
    }

    return uniqueSlug(slugify(name, 100, 'category'), (candidate) =>
      this.categoriesRepository.existsBySlug(candidate),
    );
  }

  private parseParentFilter(
    parentId: CategoryListQuery['parentId'],
  ): CategoryListQuery['parentId'] {
    if (parentId === undefined || parentId === '') {
      return undefined;
    }

    if (parentId === null) {
      return 'root';
    }

    if (parentId === 'root') {
      return 'root';
    }

    if (!OBJECT_ID_PATTERN.test(parentId)) {
      throw new BadRequestException('parentId must be "root" or a category id');
    }

    return parentId;
  }

  private toView(
    category: CategoryRecord,
    all: CategoryRecord[],
    productCounts: Map<string, number>,
    childrenCounts: Map<string, number>,
  ): CategoryView {
    const parent = category.parentId
      ? (all.find((item) => item.id === category.parentId) ?? null)
      : null;

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      image: category.image,
      parentId: category.parentId,
      parent: parent ? toRef(parent) : null,
      parentPath: pathOf(category, all),
      displayOrder: category.displayOrder,
      status: category.status,
      seoTitle: category.seoTitle,
      seoDescription: category.seoDescription,
      productCount: productCounts.get(category.id) ?? 0,
      childrenCount: childrenCounts.get(category.id) ?? 0,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }
}

// --- pure helpers -----------------------------------------------------------

function toRef(category: CategoryRecord): CategoryRef {
  return { id: category.id, name: category.name, slug: category.slug };
}

function toNode(category: CategoryRecord, productCount: number) {
  return {
    ...toRef(category),
    description: category.description,
    image: category.image,
    displayOrder: category.displayOrder,
    productCount,
    seoTitle: category.seoTitle,
    seoDescription: category.seoDescription,
  };
}

function countChildrenByParent(all: CategoryRecord[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const category of all) {
    if (category.parentId) {
      counts.set(category.parentId, (counts.get(category.parentId) ?? 0) + 1);
    }
  }

  return counts;
}

/** `Electronics › Mobiles` (empty for a root category). */
function pathOf(category: CategoryRecord, all: CategoryRecord[]): string {
  const names: string[] = [];
  const visited = new Set<string>();
  let parentId = category.parentId;

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);

    const parent = all.find((item) => item.id === parentId);

    if (!parent) {
      break;
    }

    names.unshift(parent.name);
    parentId = parent.parentId;
  }

  return names.join(' › ');
}

function byDisplayOrder(
  a: { displayOrder: number; name: string },
  b: { displayOrder: number; name: string },
): number {
  return a.displayOrder - b.displayOrder || a.name.localeCompare(b.name);
}

