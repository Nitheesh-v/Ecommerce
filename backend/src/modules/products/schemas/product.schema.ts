import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import { baseSchemaOptions } from '../../../database/base.schema.js';

export const PRODUCT_STATUSES = ['draft', 'published', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/**
 * One image of a product. Only the URL (and the storage provider's public id) is
 * stored — never binary data, so documents stay small and Mongo stays out of the
 * file-serving business.
 */
@Schema({ _id: false })
export class ProductImage {
  @Prop({ type: String, required: true, trim: true, maxlength: 500 })
  url!: string;

  /** Cloudinary `public_id`, used to delete the asset when an image is removed. */
  @Prop({ type: String, trim: true, maxlength: 200 })
  publicId?: string;

  @Prop({ type: String, trim: true, maxlength: 160 })
  alt?: string;

  @Prop({ type: Boolean, default: false })
  isPrimary!: boolean;
}

export const ProductImageSchema = SchemaFactory.createForClass(ProductImage);

/**
 * Product document.
 *
 * Conventions that matter:
 * - **Money is integer minor units (paise)**, like every other amount in the
 *   project. The UI and the API never exchange floats.
 * - `categoryId` is an `ObjectId`, because the dashboard already joins
 *   `products.categoryId` → `categories._id`.
 * - The field names are part of the analytics contract in
 *   `modules/admin/repositories/mongo-dashboard.repository.ts`
 *   (`name`, `sku`, `categoryId`, `price`, `stock`, `lowStockThreshold`,
 *   `status`, `createdAt`) — renaming any of them silently breaks the dashboard.
 */
@Schema({ ...baseSchemaOptions, collection: 'products' })
export class Product {
  @Prop({ type: String, required: true, trim: true, maxlength: 140 })
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

  @Prop({ type: String, trim: true, maxlength: 300 })
  shortDescription?: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 5000 })
  description!: string;

  /** Stored uppercase; the unique index is the real guard against duplicates. */
  @Prop({
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    maxlength: 40,
  })
  sku!: string;

  @Prop({
    type: 'ObjectId',
    ref: 'Category',
    required: true,
    index: true,
  })
  categoryId!: Types.ObjectId;

  @Prop({ type: String, trim: true, maxlength: 80 })
  brand?: string;

  /** Regular price, minor units. */
  @Prop({ type: Number, required: true, min: 1 })
  price!: number;

  /** Discounted price, minor units. Must stay below `price`. */
  @Prop({ type: Number, min: 0, default: null })
  salePrice?: number | null;

  /**
   * Internal landed cost, minor units. Admin-only: the public product view never
   * serialises it, and no public endpoint selects it for output.
   */
  @Prop({ type: Number, min: 0, default: null })
  costPrice?: number | null;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  stock!: number;

  @Prop({ type: Number, required: true, min: 0, default: 5 })
  lowStockThreshold!: number;

  @Prop({
    type: String,
    enum: PRODUCT_STATUSES,
    default: 'draft',
    required: true,
  })
  status!: ProductStatus;

  @Prop({ type: Boolean, default: false })
  isFeatured!: boolean;

  @Prop({ type: [ProductImageSchema], default: [] })
  images!: ProductImage[];

  @Prop({ type: String, trim: true, maxlength: 70 })
  seoTitle?: string;

  @Prop({ type: String, trim: true, maxlength: 160 })
  seoDescription?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ProductDocument = HydratedDocument<Product>;

export const ProductSchema = SchemaFactory.createForClass(Product);

// List view: filter by status, newest first.
ProductSchema.index({ status: 1, createdAt: -1 });
// Filter by category then status.
ProductSchema.index({ categoryId: 1, status: 1 });
// "Low stock" and "out of stock" filters.
ProductSchema.index({ stock: 1 });
// Storefront listing.
ProductSchema.index({ status: 1, isFeatured: -1, createdAt: -1 });
