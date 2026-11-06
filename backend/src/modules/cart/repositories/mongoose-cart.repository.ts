// src/modules/cart/repositories/mongoose-cart.repository.ts

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Types } from 'mongoose';
import type { Model } from 'mongoose';
import { Cart } from '../schemas/cart.schema.js';
import type { CartDocument } from '../schemas/cart.schema.js';
import { CartsRepository } from './cart.repository.js';
import type { CartItemRecord, CartRecord } from './cart.repository.js';

@Injectable()
export class MongooseCartsRepository implements CartsRepository {
  constructor(@InjectModel(Cart.name) private readonly cartModel: Model<Cart>) {}

  async findByUser(userId: string): Promise<CartRecord | null> {
    if (!isValidObjectId(userId)) {
      return null;
    }

    const document = await this.cartModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .exec();

    return document ? toRecord(document) : null;
  }

  async save(
    userId: string,
    items: CartItemRecord[],
    couponCode: string | null,
  ): Promise<CartRecord> {
    const document = await this.cartModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        {
          $set: {
            items: items.map((item) => ({
              productId: new Types.ObjectId(item.productId),
              quantity: item.quantity,
              priceAtAdd: item.priceAtAdd,
              addedAt: item.addedAt,
            })),
            couponCode,
          },
          $setOnInsert: { userId: new Types.ObjectId(userId) },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    return toRecord(document);
  }

  async setCoupon(userId: string, couponCode: string | null): Promise<void> {
    if (!isValidObjectId(userId)) {
      return;
    }

    await this.cartModel
      .updateOne({ userId: new Types.ObjectId(userId) }, { $set: { couponCode } })
      .exec();
  }

  async clear(userId: string): Promise<void> {
    if (!isValidObjectId(userId)) {
      return;
    }

    await this.cartModel
      .updateOne({ userId: new Types.ObjectId(userId) }, { $set: { items: [] } })
      .exec();
  }
}

function toRecord(document: CartDocument): CartRecord {
  return {
    id: String(document._id),
    userId: String(document.userId),
    items: (document.items ?? []).map((item) => ({
      productId: String(item.productId),
      quantity: item.quantity,
      priceAtAdd: item.priceAtAdd,
      addedAt: item.addedAt ?? document.updatedAt,
    })),
    couponCode: document.couponCode ?? null,
    updatedAt: document.updatedAt,
  };
}
