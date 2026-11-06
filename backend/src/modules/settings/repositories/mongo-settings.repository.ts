import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Order } from '../../orders/schemas/order.schema.js';
import { Product } from '../../products/schemas/product.schema.js';
import { SETTINGS_KEY, StoreSetting } from '../schemas/setting.schema.js';
import { SettingsRepository } from './settings.repository.js';
import type {
  SettingsActor,
  StoreSettingsPatch,
  StoreSettingsRecord,
} from './settings.repository.js';

type AnyDocument = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

@Injectable()
export class MongoSettingsRepository implements SettingsRepository {
  constructor(
    @InjectModel(StoreSetting.name)
    private readonly settingsModel: Model<StoreSetting>,
    // Read-only footprint check (see SettingsRepository.dataFootprint).
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  async find(): Promise<StoreSettingsRecord | null> {
    const document = await this.settingsModel
      .findOne({ key: SETTINGS_KEY })
      .lean<AnyDocument>();

    return document ? toRecord(document) : null;
  }

  async create(input: StoreSettingsRecord): Promise<StoreSettingsRecord> {
    const document = await this.settingsModel.create({
      ...input,
      key: SETTINGS_KEY,
      updatedBy: input.updatedBy ?? null,
    });

    return toRecord(document.toObject() as AnyDocument);
  }

  async update(
    patch: StoreSettingsPatch,
    actor: SettingsActor,
  ): Promise<StoreSettingsRecord | null> {
    const document = await this.settingsModel
      .findOneAndUpdate(
        { key: SETTINGS_KEY },
        {
          ...patch,
          ...(patch.address ? { address: patch.address } : {}),
          updatedBy: { userId: actor.userId ?? null, email: actor.email },
        },
        { new: true },
      )
      .lean<AnyDocument>();

    return document ? toRecord(document) : null;
  }

  async dataFootprint(): Promise<{ orders: number; products: number }> {
    const [orders, products] = await Promise.all([
      this.orderModel.countDocuments(),
      this.productModel.countDocuments(),
    ]);

    return { orders, products };
  }
}

function toRecord(document: AnyDocument): StoreSettingsRecord {
  return {
    storeName: document.storeName,
    legalName: document.legalName ?? null,
    supportEmail: document.supportEmail,
    supportPhone: document.supportPhone,
    address: {
      line1: document.address.line1,
      line2: document.address.line2 ?? undefined,
      city: document.address.city,
      state: document.address.state,
      postalCode: document.address.postalCode,
      country: document.address.country,
    },
    invoiceFooter: document.invoiceFooter ?? null,
    orderNote: document.orderNote ?? null,
    currency: document.currency,
    locale: document.locale,
    taxRatePercent: document.taxRatePercent,
    flatShippingCharge: document.flatShippingCharge,
    freeShippingThreshold: document.freeShippingThreshold,
    codEnabled: document.codEnabled !== false,
    codMaxAmount: document.codMaxAmount ?? 0,
    updatedBy: document.updatedBy
      ? { userId: document.updatedBy.userId ?? undefined, email: document.updatedBy.email }
      : null,
    createdAt: new Date(document.createdAt),
    updatedAt: new Date(document.updatedAt),
  };
}
