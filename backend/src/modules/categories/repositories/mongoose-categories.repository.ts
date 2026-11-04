import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import type { Connection, QueryFilter } from 'mongoose';
import type {
  CategoriesRepository,
  CategoryListQuery,
  CategoryListResult,
  CategoryRecord,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './categories.repository.js';
import { Category } from '../schemas/category.schema.js';
import type {
  CategoryDocument,
  CategoryStatus,
} from '../schemas/category.schema.js';

/** Escapes user input before it is used inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class MongooseCategoriesRepository implements CategoriesRepository {
  constructor(
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    // Product counts are a cross-collection aggregate; reading the collection
    // directly keeps this module free of a circular dependency on ProductsModule.
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async list(status?: CategoryStatus): Promise<CategoryRecord[]> {
    const filter = status ? { status } : {};

    const documents = await this.categoryModel
      .find(filter)
      .sort({ displayOrder: 1, name: 1 })
      .exec();

    return documents.map(toRecord);
  }

  async listPage(query: CategoryListQuery): Promise<CategoryListResult> {
    const filter: QueryFilter<Category> = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.parentId === 'root') {
      filter.parentId = null;
    } else if (query.parentId) {
      filter.parentId = query.parentId;
    }

    if (query.search) {
      const pattern = new RegExp(escapeRegExp(query.search), 'i');
      filter.$or = [{ name: pattern }, { slug: pattern }];
    }

    const sort: Record<string, 1 | -1> = {
      [query.sortBy]: query.sortOrder === 'asc' ? 1 : -1,
      // Stable tiebreaker so pagination cannot repeat or skip a row.
      _id: 1,
    };

    const [documents, total] = await Promise.all([
      this.categoryModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.categoryModel.countDocuments(filter).exec(),
    ]);

    return { items: documents.map(toRecord), total };
  }

  async findById(id: string): Promise<CategoryRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const document = await this.categoryModel.findById(id).exec();

    return document ? toRecord(document) : null;
  }

  async findBySlug(slug: string): Promise<CategoryRecord | null> {
    const document = await this.categoryModel
      .findOne({ slug: slug.toLowerCase().trim() })
      .exec();

    return document ? toRecord(document) : null;
  }

  async create(input: CreateCategoryInput): Promise<CategoryRecord> {
    const created = await this.categoryModel.create(toDocument(input));

    return toRecord(created);
  }

  async update(
    id: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const document = await this.categoryModel
      .findByIdAndUpdate(id, { $set: toDocument(input) }, { new: true })
      .exec();

    return document ? toRecord(document) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!isValidObjectId(id)) {
      return false;
    }

    const result = await this.categoryModel.findByIdAndDelete(id).exec();

    return result !== null;
  }

  async existsByNameUnderParent(
    name: string,
    parentId: string | null,
    excludeId?: string,
  ): Promise<boolean> {
    const filter: QueryFilter<Category> = {
      parentId: parentId ?? null,
      // Case-insensitive equality without a collation index.
      name: new RegExp(`^${escapeRegExp(name.trim())}$`, 'i'),
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    return (await this.categoryModel.countDocuments(filter).exec()) > 0;
  }

  async existsBySlug(slug: string, excludeId?: string): Promise<boolean> {
    const filter: QueryFilter<Category> = { slug: slug.toLowerCase().trim() };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    return (await this.categoryModel.countDocuments(filter).exec()) > 0;
  }

  async countChildren(parentId: string): Promise<number> {
    if (!isValidObjectId(parentId)) {
      return 0;
    }

    return this.categoryModel.countDocuments({ parentId }).exec();
  }

  async countProducts(categoryIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    const ids = categoryIds.filter((id) => isValidObjectId(id));

    if (ids.length === 0) {
      return counts;
    }

    const rows = await this.connection
      .collection('products')
      .aggregate<{ _id: unknown; count: number }>([
        { $match: { categoryId: { $in: ids.map((id) => new Types.ObjectId(id)) } } },
        { $group: { _id: '$categoryId', count: { $sum: 1 } } },
      ])
      .toArray();

    for (const row of rows) {
      counts.set(String(row._id), row.count);
    }

    return counts;
  }

  async countAll(): Promise<number> {
    return this.categoryModel.countDocuments({}).exec();
  }
}

/** Maps the service input onto the fields the schema owns. */
function toDocument(input: CreateCategoryInput | UpdateCategoryInput) {
  const document: Record<string, unknown> = {};

  if (input.name !== undefined) document.name = input.name.trim();
  if (input.slug !== undefined) document.slug = input.slug.toLowerCase().trim();
  if (input.description !== undefined) document.description = input.description;
  if (input.image !== undefined) document.image = input.image;
  if (input.parentId !== undefined) document.parentId = input.parentId;
  if (input.displayOrder !== undefined) document.displayOrder = input.displayOrder;
  if (input.status !== undefined) document.status = input.status;
  if (input.seoTitle !== undefined) document.seoTitle = input.seoTitle;
  if (input.seoDescription !== undefined) {
    document.seoDescription = input.seoDescription;
  }

  return document;
}

function toRecord(document: CategoryDocument): CategoryRecord {
  return {
    id: String(document._id),
    name: document.name,
    slug: document.slug,
    description: document.description,
    image: document.image
      ? {
          url: document.image.url,
          publicId: document.image.publicId,
          alt: document.image.alt,
        }
      : null,
    parentId: document.parentId ? String(document.parentId) : null,
    displayOrder: document.displayOrder ?? 0,
    status: document.status,
    seoTitle: document.seoTitle,
    seoDescription: document.seoDescription,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}
