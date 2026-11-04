import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import type {
  CategoryRecord,
  CategoriesRepository,
  CreateCategoryInput,
} from './categories.repository.js';
import { Category } from '../schemas/category.schema.js';
import type {
  CategoryDocument,
  CategoryStatus,
} from '../schemas/category.schema.js';

@Injectable()
export class MongooseCategoriesRepository implements CategoriesRepository {
  constructor(
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
  ) {}

  async list(status?: CategoryStatus): Promise<CategoryRecord[]> {
    const filter = status ? { status } : {};

    const documents = await this.categoryModel
      .find(filter)
      .sort({ name: 1 })
      .exec();

    return documents.map(toRecord);
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
    const created = await this.categoryModel.create({
      name: input.name.trim(),
      slug: input.slug.toLowerCase().trim(),
      status: input.status ?? 'active',
    });

    return toRecord(created);
  }

  async countAll(): Promise<number> {
    return this.categoryModel.countDocuments({}).exec();
  }
}

function toRecord(document: CategoryDocument): CategoryRecord {
  return {
    id: String(document._id),
    name: document.name,
    slug: document.slug,
    status: document.status,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}
