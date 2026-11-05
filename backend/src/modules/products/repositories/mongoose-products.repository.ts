import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Types } from 'mongoose';
import type { Connection, Model, QueryFilter, SortOrder } from 'mongoose';
import { Product } from '../schemas/product.schema.js';
import type { ProductDocument } from '../schemas/product.schema.js';
import type { ProductImageInput } from './products.repository.js';
import type {
  CreateProductInput,
  ProductFacets,
  ProductListFilter,
  ProductListResult,
  ProductRecord,
  ProductsRepository,
  UpdateProductInput,
} from './products.repository.js';

@Injectable()
export class MongooseProductsRepository implements ProductsRepository {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async create(input: CreateProductInput): Promise<ProductRecord | null> {
    try {
      const created = await this.productModel.create(toDocument(input));

      return toRecord(created);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return null;
      }

      throw error;
    }
  }

  async findById(id: string): Promise<ProductRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const document = await this.productModel.findById(id).exec();

    return document ? toRecord(document) : null;
  }

  async findBySlug(slug: string): Promise<ProductRecord | null> {
    const document = await this.productModel
      .findOne({ slug: slug.toLowerCase().trim() })
      .exec();

    return document ? toRecord(document) : null;
  }

  async update(
    id: string,
    input: UpdateProductInput,
  ): Promise<ProductRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    try {
      const updated = await this.productModel
        .findByIdAndUpdate(id, { $set: toDocument(input, true) }, { new: true })
        .exec();

      return updated ? toRecord(updated) : null;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return null;
      }

      throw error;
    }
  }

  async list(filter: ProductListFilter): Promise<ProductListResult> {
    const query: QueryFilter<Product> = {};

    if (filter.status) {
      query.status = filter.status;
    }

    if (filter.isFeatured !== undefined) {
      query.isFeatured = filter.isFeatured;
    }

    if (filter.categoryId && isValidObjectId(filter.categoryId)) {
      query.categoryId = new Types.ObjectId(filter.categoryId);
    }

    if (filter.search?.trim()) {
      const pattern = new RegExp(escapeRegExp(filter.search.trim()), 'i');
      query.$or = [{ name: pattern }, { sku: pattern }, { slug: pattern }];
    }

    // Price is compared on what the customer actually pays, so a sale price is
    // the number the slider filters on.
    const effectivePrice = { $ifNull: ['$salePrice', '$price'] };
    const expressions: Record<string, unknown>[] = [];

    if (filter.stockStatus === 'in') {
      query.stock = { $gt: 0 };
    } else if (filter.stockStatus === 'out') {
      query.stock = { $lte: 0 };
    } else if (filter.stockStatus === 'low') {
      // Running low but not empty: 0 < stock <= threshold (default 5).
      expressions.push({
        $and: [
          { $gt: ['$stock', 0] },
          { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', 5] }] },
        ],
      });
    }

    if (filter.inStock) {
      query.stock = { $gt: 0 };
    }

    if (filter.minPrice !== undefined) {
      expressions.push({ $gte: [effectivePrice, filter.minPrice] });
    }

    if (filter.maxPrice !== undefined) {
      expressions.push({ $lte: [effectivePrice, filter.maxPrice] });
    }

    if (filter.onSale) {
      expressions.push({
        $and: [{ $ne: ['$salePrice', null] }, { $lt: ['$salePrice', '$price'] }],
      });
    }

    if (filter.minRating !== undefined) {
      query.ratingAverage = { $gte: filter.minRating };
    }

    if (expressions.length === 1) {
      query.$expr = expressions[0];
    } else if (expressions.length > 1) {
      query.$expr = { $and: expressions };
    }

    // "Highest rated" breaks ties by how many ratings back the average: 5.0 from one
    // review should not outrank 4.8 from two hundred.
    const sort: Record<string, SortOrder> =
      filter.sortBy === 'rating'
        ? { ratingAverage: filter.sortOrder === 'asc' ? 1 : -1, ratingCount: -1 }
        : { [filter.sortBy]: filter.sortOrder === 'asc' ? 1 : -1 };

    const [documents, total] = await Promise.all([
      this.productModel
        .find(query)
        .sort(sort)
        .skip((filter.page - 1) * filter.limit)
        .limit(filter.limit)
        .exec(),
      this.productModel.countDocuments(query).exec(),
    ]);

    return { items: documents.map(toRecord), total };
  }

  async delete(id: string): Promise<boolean> {
    if (!isValidObjectId(id)) {
      return false;
    }

    const result = await this.productModel.findByIdAndDelete(id).exec();

    return result !== null;
  }

  async existsBySku(sku: string, excludeId?: string): Promise<boolean> {
    return this.exists({ sku: sku.toUpperCase().trim() }, excludeId);
  }

  async existsBySlug(slug: string, excludeId?: string): Promise<boolean> {
    return this.exists({ slug: slug.toLowerCase().trim() }, excludeId);
  }

  async countOrderReferences(productId: string): Promise<number> {
    if (!isValidObjectId(productId)) {
      return 0;
    }

    // Read through the driver: orders belong to a later module, so there is no
    // model to inject yet, but the collection shape is already fixed.
    return this.connection
      .collection('orders')
      .countDocuments({ 'items.productId': new Types.ObjectId(productId) });
  }

  async updateRating(
    productId: string,
    average: number,
    count: number,
  ): Promise<void> {
    if (!isValidObjectId(productId)) {
      return;
    }

    // A cache write, not a business rule: a deleted product simply has no rating.
    await this.productModel
      .updateOne(
        { _id: new Types.ObjectId(productId) },
        { $set: { ratingAverage: average, ratingCount: count } },
      )
      .exec();
  }

  async facets(): Promise<ProductFacets> {
    const effectivePrice = { $ifNull: ['$salePrice', '$price'] };

    const [perCategory, overall] = await Promise.all([
      this.productModel
        .aggregate<{
          _id: Types.ObjectId;
          count: number;
          minPrice: number;
          maxPrice: number;
        }>([
          { $match: { status: 'published' } },
          {
            $group: {
              _id: '$categoryId',
              count: { $sum: 1 },
              minPrice: { $min: effectivePrice },
              maxPrice: { $max: effectivePrice },
            },
          },
        ])
        .exec(),
      this.productModel
        .aggregate<{
          total: number;
          min: number | null;
          max: number | null;
          inStock: number;
          onSale: number;
          rating4: number;
          rating3: number;
        }>([
          { $match: { status: 'published' } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              min: { $min: effectivePrice },
              max: { $max: effectivePrice },
              inStock: { $sum: { $cond: [{ $gt: ['$stock', 0] }, 1, 0] } },
              onSale: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ['$salePrice', null] },
                        { $lt: ['$salePrice', '$price'] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              rating4: { $sum: { $cond: [{ $gte: ['$ratingAverage', 4] }, 1, 0] } },
              rating3: { $sum: { $cond: [{ $gte: ['$ratingAverage', 3] }, 1, 0] } },
            },
          },
        ])
        .exec(),
    ]);

    const summary = overall[0];

    return {
      total: summary?.total ?? 0,
      categories: perCategory.map((row) => ({
        categoryId: String(row._id),
        count: row.count,
        minPrice: row.minPrice,
        maxPrice: row.maxPrice,
      })),
      price: { min: summary?.min ?? 0, max: summary?.max ?? 0 },
      ratings: [
        { min: 4, count: summary?.rating4 ?? 0 },
        { min: 3, count: summary?.rating3 ?? 0 },
      ],
      inStock: summary?.inStock ?? 0,
      onSale: summary?.onSale ?? 0,
    };
  }

  private async exists(
    filter: QueryFilter<Product>,
    excludeId?: string,
  ): Promise<boolean> {
    if (excludeId) {
      if (!isValidObjectId(excludeId)) {
        return false;
      }

      filter._id = { $ne: new Types.ObjectId(excludeId) };
    }

    const result = await this.productModel.exists(filter).exec();

    return result !== null;
  }
}

/** Maps the service input onto the document shape (only defined keys). */
function toDocument(
  input: CreateProductInput | UpdateProductInput,
  partial = false,
): Record<string, unknown> {
  const document: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }

    if (key === 'categoryId') {
      document.categoryId = new Types.ObjectId(String(value));

      continue;
    }

    if (key === 'images') {
      document.images = (value as ProductImageInput[]).map((image) => ({
        url: image.url,
        ...(image.publicId ? { publicId: image.publicId } : {}),
        ...(image.alt ? { alt: image.alt } : {}),
        isPrimary: image.isPrimary ?? false,
      }));

      continue;
    }

    document[key] = value;
  }

  if (!partial) {
    document.images ??= [];
  }

  return document;
}

function toRecord(document: ProductDocument): ProductRecord {
  return {
    id: String(document._id),
    name: document.name,
    slug: document.slug,
    shortDescription: document.shortDescription,
    description: document.description,
    sku: document.sku,
    categoryId: String(document.categoryId),
    brand: document.brand,
    price: document.price,
    salePrice: document.salePrice ?? null,
    costPrice: document.costPrice ?? null,
    stock: document.stock,
    lowStockThreshold: document.lowStockThreshold,
    status: document.status,
    isFeatured: document.isFeatured,
    ratingAverage: document.ratingAverage ?? 0,
    ratingCount: document.ratingCount ?? 0,
    images: (document.images ?? []).map((image) => ({
      url: image.url,
      publicId: image.publicId,
      alt: image.alt,
      isPrimary: image.isPrimary,
    })),
    seoTitle: document.seoTitle,
    seoDescription: document.seoDescription,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}
