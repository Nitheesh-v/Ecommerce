import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import { baseSchemaOptions } from '../../../database/base.schema.js';

export const CATEGORY_STATUSES = ['active', 'inactive'] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

/**
 * A category image is a *reference*, never the bytes: the upload endpoint stores
 * the file (local disk or Cloudinary) and returns a URL we persist here.
 */
@Schema({ _id: false })
export class CategoryImage {
  @Prop({ type: String, required: true, trim: true })
  url!: string;

  /** Provider handle, used later to delete the asset (Cloudinary public_id). */
  @Prop({ type: String, trim: true })
  publicId?: string;

  @Prop({ type: String, trim: true, maxlength: 160 })
  alt?: string;
}

export const CategoryImageSchema = SchemaFactory.createForClass(CategoryImage);

/**
 * Category collection.
 *
 * The dashboard and the products module already depend on this shape:
 * - `products.categoryId` is an `ObjectId` pointing at `_id`;
 * - analytics join `products.categoryId → categories._id` and read `name`;
 * - only `status: 'active'` categories may be assigned to *published* products.
 *
 * Hierarchy: `parentId` is `null` for a root category. Depth is capped in the
 * service (not here) so the rule can produce a readable error message.
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

  @Prop({ type: String, trim: true, maxlength: 500 })
  description?: string;

  @Prop({ type: CategoryImageSchema, default: null })
  image?: CategoryImage | null;

  /** `null` = top-level category. Indexed because the list filters on it. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Category.name, default: null })
  parentId!: string | null;

  /** Manual ordering inside a parent; lower comes first. */
  @Prop({ type: Number, default: 0, min: 0, max: 9999 })
  displayOrder!: number;

  @Prop({
    type: String,
    enum: CATEGORY_STATUSES,
    default: 'active',
    required: true,
    index: true,
  })
  status!: CategoryStatus;

  @Prop({ type: String, trim: true, maxlength: 70 })
  seoTitle?: string;

  @Prop({ type: String, trim: true, maxlength: 160 })
  seoDescription?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type CategoryDocument = HydratedDocument<Category>;

export const CategorySchema = SchemaFactory.createForClass(Category);

// Storefront: active categories in display order.
CategorySchema.index({ status: 1, displayOrder: 1, name: 1 });
// Admin tree + "children of X" lookups.
CategorySchema.index({ parentId: 1, displayOrder: 1 });
// Sibling-name uniqueness is enforced by the service; this index serves the lookup.
CategorySchema.index({ parentId: 1, name: 1 });
