import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createPaginatedResult } from '../../common/utils/pagination.util.js';
import type { PaginatedResult } from '../../common/utils/pagination.util.js';
import { CategoriesService } from '../categories/categories.service.js';
import type { CategoryRecord } from '../categories/repositories/categories.repository.js';
import type {
  AdminProductsQueryDto,
  CreateProductDto,
  PublicProductsQueryDto,
} from './dto/create-product.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';
import type { ProductImageInput } from './repositories/products.repository.js';
import { ProductsRepository } from './repositories/products.repository.js';
import type {
  ProductRecord,
  StockStatusFilter,
} from './repositories/products.repository.js';
import type { ProductStatus } from './schemas/product.schema.js';
import { slugify, uniqueSlug } from './utils/slug.util.js';

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
}

/** Admin projection: everything, including the internal cost price. */
export interface AdminProductView extends ProductRecord {
  category: CategorySummary | null;
  stockStatus: StockStatusFilter;
  /** What a customer would actually pay: `salePrice` when set, else `price`. */
  effectivePrice: number;
}

/** Public projection: no cost price, no internal bookkeeping. */
export interface PublicProductView {
  id: string;
  name: string;
  slug: string;
  shortDescription?: string;
  description: string;
  sku: string;
  brand?: string;
  category: CategorySummary | null;
  price: number;
  salePrice?: number | null;
  effectivePrice: number;
  stock: number;
  inStock: boolean;
  isFeatured: boolean;
  images: { url: string; alt?: string; isPrimary: boolean }[];
  seoTitle?: string;
  seoDescription?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeleteProductResult {
  deleted: boolean;
  archived: boolean;
  referencedOrders: number;
  message: string;
}

const MAX_IMAGES = 8;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly categoriesService: CategoriesService,
  ) {}

  // ---------------------------------------------------------------- admin reads

  async listForAdmin(
    query: AdminProductsQueryDto,
  ): Promise<PaginatedResult<AdminProductView>> {
    const { items, total } = await this.productsRepository.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
      categoryId: query.category,
      status: query.status,
      stockStatus: query.stockStatus,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const categories = await this.categoryMap();

    return createPaginatedResult(
      items.map((item) => this.toAdminView(item, categories.get(item.categoryId))),
      query.page,
      query.limit,
      total,
    );
  }

  async getForAdmin(id: string): Promise<AdminProductView> {
    const record = await this.requireProduct(id);
    const category = await this.categoriesService.findById(record.categoryId);

    return this.toAdminView(record, category);
  }

  // ------------------------------------------------------------- public reads

  async listPublic(
    query: PublicProductsQueryDto,
  ): Promise<PaginatedResult<PublicProductView>> {
    const category = query.category
      ? await this.categoriesService
          .listActive()
          .then((list) => list.find((item) => item.slug === query.category) ?? null)
      : null;

    // An unknown category slug is an empty page, not an error: it is a URL a
    // customer can reach by editing the address bar.
    if (query.category && !category) {
      return createPaginatedResult([], query.page, query.limit, 0);
    }

    const { items, total } = await this.productsRepository.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
      categoryId: category?.id,
      status: 'published',
      isFeatured: query.featured,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const categories = await this.categoryMap();

    return createPaginatedResult(
      items.map((item) => this.toPublicView(item, categories.get(item.categoryId))),
      query.page,
      query.limit,
      total,
    );
  }

  async getPublic(idOrSlug: string): Promise<PublicProductView> {
    const record = OBJECT_ID_PATTERN.test(idOrSlug)
      ? await this.productsRepository.findById(idOrSlug)
      : await this.productsRepository.findBySlug(idOrSlug);

    // Drafts and archived products are indistinguishable from missing ones: a
    // customer must not be able to probe the catalogue.
    if (!record || record.status !== 'published') {
      throw new NotFoundException('Product not found');
    }

    const category = await this.categoriesService.findById(record.categoryId);

    return this.toPublicView(record, category);
  }

  // ------------------------------------------------------------------ writes

  async create(dto: CreateProductDto): Promise<AdminProductView> {
    const sku = normalizeSku(dto.sku);
    const slug = await this.resolveSlug(dto.slug, dto.name);

    this.assertPricing(dto.price, dto.salePrice);

    if (await this.productsRepository.existsBySku(sku)) {
      throw new ConflictException(`A product with SKU "${sku}" already exists`);
    }

    const status = dto.status ?? 'draft';
    const category = await this.requireCategory(dto.categoryId, status);

    const created = await this.productsRepository.create({
      name: dto.name.trim(),
      slug,
      shortDescription: dto.shortDescription?.trim(),
      description: dto.description.trim(),
      sku,
      categoryId: dto.categoryId,
      brand: dto.brand?.trim(),
      price: dto.price,
      salePrice: dto.salePrice ?? null,
      costPrice: dto.costPrice ?? null,
      stock: dto.stock ?? 0,
      lowStockThreshold: dto.lowStockThreshold ?? 5,
      status,
      isFeatured: dto.isFeatured ?? false,
      images: normalizeImages(dto.images ?? []),
      seoTitle: dto.seoTitle?.trim(),
      seoDescription: dto.seoDescription?.trim(),
    });

    if (!created) {
      // Lost a race against a concurrent insert: the unique index is the source
      // of truth, so report the conflict rather than a generic 500.
      throw new ConflictException('A product with this SKU or slug already exists');
    }

    return this.toAdminView(created, category);
  }

  async update(id: string, dto: UpdateProductDto): Promise<AdminProductView> {
    const existing = await this.requireProduct(id);

    const price = dto.price ?? existing.price;
    const salePrice =
      dto.salePrice === undefined ? existing.salePrice : dto.salePrice;

    this.assertPricing(price, salePrice);

    const sku = dto.sku !== undefined ? normalizeSku(dto.sku) : undefined;

    if (
      sku &&
      sku !== existing.sku &&
      (await this.productsRepository.existsBySku(sku, id))
    ) {
      throw new ConflictException(`A product with SKU "${sku}" already exists`);
    }

    let slug: string | undefined;

    if (dto.slug !== undefined) {
      slug = normalizeSlug(dto.slug);

      if (
        slug !== existing.slug &&
        (await this.productsRepository.existsBySlug(slug, id))
      ) {
        throw new ConflictException(`The slug "${slug}" is already in use`);
      }
    }

    const status = dto.status ?? existing.status;
    const categoryId = dto.categoryId ?? existing.categoryId;
    const category = await this.requireCategory(categoryId, status);

    const updated = await this.productsRepository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(dto.shortDescription !== undefined
        ? { shortDescription: dto.shortDescription.trim() }
        : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() }
        : {}),
      ...(sku !== undefined ? { sku } : {}),
      ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      ...(dto.brand !== undefined ? { brand: dto.brand.trim() } : {}),
      ...(dto.price !== undefined ? { price: dto.price } : {}),
      ...(dto.salePrice !== undefined ? { salePrice: dto.salePrice } : {}),
      ...(dto.costPrice !== undefined ? { costPrice: dto.costPrice } : {}),
      ...(dto.stock !== undefined ? { stock: dto.stock } : {}),
      ...(dto.lowStockThreshold !== undefined
        ? { lowStockThreshold: dto.lowStockThreshold }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
      ...(dto.images !== undefined ? { images: normalizeImages(dto.images) } : {}),
      ...(dto.seoTitle !== undefined ? { seoTitle: dto.seoTitle.trim() } : {}),
      ...(dto.seoDescription !== undefined
        ? { seoDescription: dto.seoDescription.trim() }
        : {}),
    });

    if (!updated) {
      throw new ConflictException('A product with this SKU or slug already exists');
    }

    return this.toAdminView(updated, category);
  }

  async changeStatus(
    id: string,
    status: ProductStatus,
  ): Promise<AdminProductView> {
    const existing = await this.requireProduct(id);
    const category = await this.requireCategory(existing.categoryId, status);

    const updated = await this.productsRepository.update(id, { status });

    if (!updated) {
      throw new NotFoundException('Product not found');
    }

    return this.toAdminView(updated, category);
  }

  /**
   * Deletes when it is safe, archives when order history references the product.
   *
   * A hard delete would leave `orders.items[].productId` dangling and break
   * historical invoices, so the presence of any reference turns this into a
   * soft delete that reports why.
   */
  async remove(id: string): Promise<DeleteProductResult> {
    await this.requireProduct(id);

    const referencedOrders =
      await this.productsRepository.countOrderReferences(id);

    if (referencedOrders > 0) {
      await this.productsRepository.update(id, { status: 'archived' });

      return {
        deleted: false,
        archived: true,
        referencedOrders,
        message: `Product is referenced by ${referencedOrders} order(s); it was archived instead of deleted to preserve order history.`,
      };
    }

    const deleted = await this.productsRepository.delete(id);

    if (!deleted) {
      throw new NotFoundException('Product not found');
    }

    return {
      deleted: true,
      archived: false,
      referencedOrders: 0,
      message: 'Product deleted permanently.',
    };
  }

  // ------------------------------------------------------------------ helpers

  private async requireProduct(id: string): Promise<ProductRecord> {
    const record = OBJECT_ID_PATTERN.test(id)
      ? await this.productsRepository.findById(id)
      : null;

    if (!record) {
      throw new NotFoundException('Product not found');
    }

    return record;
  }

  /**
   * A category must exist to be assigned, and must be *active* before a product
   * can be published. Drafts may point at an inactive category so an admin can
   * stage work while a category is being reorganised.
   */
  private async requireCategory(
    categoryId: string,
    status: ProductStatus,
  ): Promise<CategoryRecord> {
    if (!OBJECT_ID_PATTERN.test(categoryId)) {
      throw new BadRequestException('categoryId must be a valid category id');
    }

    const category = await this.categoriesService.findById(categoryId);

    if (!category) {
      throw new BadRequestException('Category does not exist');
    }

    if (status === 'published' && category.status !== 'active') {
      throw new BadRequestException(
        `Category "${category.name}" is inactive; reactivate it before publishing`,
      );
    }

    return category;
  }

  private async resolveSlug(
    provided: string | undefined,
    name: string,
  ): Promise<string> {
    if (provided) {
      const slug = normalizeSlug(provided);

      if (await this.productsRepository.existsBySlug(slug)) {
        throw new ConflictException(`The slug "${slug}" is already in use`);
      }

      return slug;
    }

    return uniqueSlug(slugify(name), (candidate) =>
      this.productsRepository.existsBySlug(candidate),
    );
  }

  private assertPricing(price: number, salePrice?: number | null): void {
    if (!Number.isInteger(price) || price <= 0) {
      throw new BadRequestException('price must be a positive integer (minor units)');
    }

    if (salePrice === undefined || salePrice === null) {
      return;
    }

    if (!Number.isInteger(salePrice) || salePrice < 0) {
      throw new BadRequestException(
        'salePrice must be a non-negative integer (minor units)',
      );
    }

    if (salePrice >= price) {
      throw new BadRequestException(
        'salePrice must be lower than the regular price',
      );
    }
  }

  private async categoryMap(): Promise<Map<string, CategoryRecord>> {
    const categories = await this.categoriesService.list();

    return new Map(categories.map((category) => [category.id, category]));
  }

  private toAdminView(
    record: ProductRecord,
    category: CategoryRecord | null | undefined,
  ): AdminProductView {
    return {
      ...record,
      category: category ? summarize(category) : null,
      stockStatus: stockStatusOf(record),
      effectivePrice: record.salePrice ?? record.price,
    };
  }

  private toPublicView(
    record: ProductRecord,
    category: CategoryRecord | null | undefined,
  ): PublicProductView {
    // Explicit projection on purpose: adding a field to the record must be a
    // deliberate decision here, never an accidental leak (cost price!).
    return {
      id: record.id,
      name: record.name,
      slug: record.slug,
      shortDescription: record.shortDescription,
      description: record.description,
      sku: record.sku,
      brand: record.brand,
      category: category ? summarize(category) : null,
      price: record.price,
      salePrice: record.salePrice,
      effectivePrice: record.salePrice ?? record.price,
      stock: record.stock,
      inStock: record.stock > 0,
      isFeatured: record.isFeatured,
      images: record.images.map((image) => ({
        url: image.url,
        alt: image.alt,
        isPrimary: image.isPrimary,
      })),
      seoTitle: record.seoTitle,
      seoDescription: record.seoDescription,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

function summarize(category: CategoryRecord): CategorySummary {
  return { id: category.id, name: category.name, slug: category.slug };
}

function stockStatusOf(record: ProductRecord) {
  if (record.stock <= 0) {
    return 'out' as const;
  }

  return record.stock <= record.lowStockThreshold
    ? ('low' as const)
    : ('in' as const);
}

function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/** Caps the list at 8, drops duplicates and guarantees exactly one primary. */
function normalizeImages(images: ProductImageInput[]): ProductImageInput[] {
  const seen = new Set<string>();
  const unique = images
    .filter((image) => image.url?.trim())
    .filter((image) => {
      const key = image.url.trim();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;
    })
    .slice(0, MAX_IMAGES)
    .map((image) => ({
      url: image.url.trim(),
      publicId: image.publicId?.trim() || undefined,
      alt: image.alt?.trim() || undefined,
      isPrimary: Boolean(image.isPrimary),
    }));

  if (unique.length === 0) {
    return unique;
  }

  const primaryIndex = unique.findIndex((image) => image.isPrimary);
  const resolvedPrimary = primaryIndex === -1 ? 0 : primaryIndex;

  return unique.map((image, index) => ({
    ...image,
    isPrimary: index === resolvedPrimary,
  }));
}
