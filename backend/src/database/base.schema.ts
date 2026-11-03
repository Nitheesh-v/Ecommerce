import type { SchemaOptions } from 'mongoose';

/** Fields every document in this project has, because `timestamps` is on. */
export interface BaseDocumentFields {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Default schema options shared by every collection.
 *
 * Spread it into the `@Schema()` decorator of each entity:
 *
 * ```ts
 * @Schema({ ...baseSchemaOptions, collection: 'categories' })
 * export class Category extends BaseDocumentFields {
 *   @Prop({ required: true, unique: true })
 *   name!: string;
 * }
 * ```
 *
 * Why these defaults:
 * - `timestamps` — `createdAt` / `updatedAt` everywhere, no manual bookkeeping.
 * - `versionKey: false` — `__v` never reaches an API response.
 * - `toJSON` — `_id` is exposed as a string `id`, and `__v` is dropped, so
 *   controllers can return documents and the envelope stays clean. Passwords and
 *   other secrets must still be excluded per-schema (Phase 5).
 */
export const baseSchemaOptions: SchemaOptions = {
  timestamps: true,
  versionKey: false,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      if (ret._id !== undefined) {
        ret.id = String(ret._id);
      }
      delete ret._id;
      delete ret.__v;

      return ret;
    },
  },
  toObject: { virtuals: true },
};
