import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { baseSchemaOptions } from '../../../database/base.schema.js';

export const CATEGORY_STATUSES = ['active', 'inactive'] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

/**
 * Categories are created by their own module (next phase); the product module
 * only needs to *reference* them, so this schema and its read repository are the
 * minimum required here.
 *
 * The dashboard already joins `products.categoryId` → `categories._id`, so the
 * reference is an `ObjectId` and the field name is fixed by that contract.
 */
@Schema({ ...baseSchemaOptions, collection: 'categories' })
export class Category {
  @Prop({ type: String, required: true, trim: true, maxlength: 80 })
  name!: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 100,
  })
  slug!: string;

  @Prop({
    type: String,
    enum: CATEGORY_STATUSES,
    default: 'active',
    required: true,
    index: true,
  })
  status!: CategoryStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export type CategoryDocument = HydratedDocument<Category>;

export const CategorySchema = SchemaFactory.createForClass(Category);

CategorySchema.index({ status: 1, name: 1 });
