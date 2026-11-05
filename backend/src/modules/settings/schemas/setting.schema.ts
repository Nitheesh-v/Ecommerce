import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import { baseSchemaOptions } from '../../../database/base.schema.js';

/**
 * Store settings — one document, keyed `store`.
 *
 * The document is the authority for the store's identity *and* for the pricing
 * inputs checkout uses (currency, tax rate, shipping fee, free-shipping threshold).
 * The `ORDER_*` environment variables are only defaults: they seed a fresh database,
 * and from then on this record wins.
 *
 * Currency is deliberately hard to change: every price and every order is stored in
 * **minor units of one currency**, so switching it later would relabel existing
 * amounts rather than convert them. `SettingsService.update()` refuses the change
 * once the catalogue or order book is non-empty.
 */

export interface StoreAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export const SETTINGS_KEY = 'store';

const addressSchema = new MongooseSchema(
  {
    line1: { type: String, required: true, trim: true, maxlength: 200 },
    line2: { type: String, default: null, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 120 },
    state: { type: String, required: true, trim: true, maxlength: 120 },
    postalCode: { type: String, required: true, trim: true, maxlength: 20 },
    country: { type: String, required: true, trim: true, maxlength: 120 },
  },
  { _id: false },
);

const actorSchema = new MongooseSchema(
  {
    userId: { type: String, default: null },
    email: { type: String, required: true },
  },
  { _id: false },
);

@Schema({ ...baseSchemaOptions, collection: 'settings' })
export class StoreSetting {
  @Prop({ type: String, required: true, unique: true, default: SETTINGS_KEY })
  key!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 120 })
  storeName!: string;

  @Prop({ type: String, default: null, trim: true, maxlength: 160 })
  legalName!: string | null;

  @Prop({ type: String, required: true, trim: true, lowercase: true, maxlength: 160 })
  supportEmail!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 32 })
  supportPhone!: string;

  @Prop({ type: addressSchema, required: true })
  address!: StoreAddress;

  @Prop({ type: String, default: null, trim: true, maxlength: 500 })
  invoiceFooter!: string | null;

  @Prop({ type: String, default: null, trim: true, maxlength: 300 })
  orderNote!: string | null;

  /** ISO 4217. Guards in the service make this effectively write-once. */
  @Prop({ type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 })
  currency!: string;

  /** BCP-47 tag used for money and date formatting in the console and storefront. */
  @Prop({ type: String, required: true, trim: true, maxlength: 20 })
  locale!: string;

  @Prop({ type: Number, required: true, min: 0, max: 100 })
  taxRatePercent!: number;

  /** Flat shipping fee, minor units. */
  @Prop({ type: Number, required: true, min: 0 })
  flatShippingCharge!: number;

  /** Order value from which shipping is free, minor units. */
  @Prop({ type: Number, required: true, min: 0 })
  freeShippingThreshold!: number;

  @Prop({ type: Boolean, default: true })
  codEnabled!: boolean;

  @Prop({ type: actorSchema, default: null })
  updatedBy!: { userId: string | null; email: string } | null;
}

export const StoreSettingSchema = SchemaFactory.createForClass(StoreSetting);
