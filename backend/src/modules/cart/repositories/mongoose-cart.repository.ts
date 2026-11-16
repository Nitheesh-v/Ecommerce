// src/modules/cart/repositories/mongoose-cart.repository.ts

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Types } from 'mongoose';
import type { Model } from 'mongoose';
import {
  USER_PREFIX,
  isGuestCartId,
  userIdOfCart,
} from '../../../common/utils/cart-identity.util.js';
import { Cart } from '../schemas/cart.schema.js';
import type { CartDocument } from '../schemas/cart.schema.js';
import { CartsRepository } from './cart.repository.js';
import type { CartItemRecord, CartRecord } from './cart.repository.js';

@Injectable()
export class MongooseCartsRepository implements CartsRepository {
  constructor(@InjectModel(Cart.name) private readonly cartModel: Model<Cart>) {}

  async findByOwner(ownerId: string): Promise<CartRecord | null> {
    const document = await this.cartModel.findOne(this.ownerFilter(ownerId)).exec();

    // A retired guest cart is as good as absent: its contents now belong to an
    // account, and the token that opened it may still be in a browser.
    if (!document || document.retiredAt) {
      return null;
    }

    return toRecord(document);
  }

  async retire(ownerId: string): Promise<void> {
    await this.cartModel
      .updateOne(this.ownerFilter(ownerId), { $set: { retiredAt: new Date() } })
      .exec();
  }

  async save(
    ownerId: string,
    items: CartItemRecord[],
    couponCode: string | null,
  ): Promise<CartRecord> {
    const userId = userIdOfCart(ownerId);

    const document = await this.cartModel
      .findOneAndUpdate(
        this.ownerFilter(ownerId),
        {
          $set: {
            ownerId,
            userId,
            retiredAt: null,
            items: items.map((item) => ({
              productId: new Types.ObjectId(item.productId),
              quantity: item.quantity,
              priceAtAdd: item.priceAtAdd,
              addedAt: item.addedAt,
            })),
            couponCode,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    return toRecord(document);
  }

  async setCoupon(ownerId: string, couponCode: string | null): Promise<void> {
    await this.cartModel
      .updateOne(this.ownerFilter(ownerId), { $set: { couponCode } })
      .exec();
  }

  async clear(ownerId: string): Promise<void> {
    await this.cartModel.deleteOne(this.ownerFilter(ownerId)).exec();
  }

  /**
   * `cart:<userId>` documents written before guest carts existed hold the bare user
   * id, so an account's lookup also matches that legacy form. Reads and writes both
   * go through here, which is why an existing customer never loses a cart on the
   * deploy that introduced this.
   */
  private ownerFilter(ownerId: string): Record<string, unknown> {
    if (isGuestCartId(ownerId)) {
      return { ownerId };
    }

    const userId = userIdOfCart(ownerId);

    if (userId && isValidObjectId(userId)) {
      return {
        $or: [
          { ownerId },
          { ownerId: userId },
          { userId: new Types.ObjectId(userId) },
        ],
      };
    }

    return { ownerId };
  }
}

function toRecord(document: CartDocument): CartRecord {
  return {
    id: document.id as string,
    ownerId: document.ownerId ?? `${USER_PREFIX}${String(document.userId)}`,
    userId: document.userId ?? null,
    retiredAt: document.retiredAt ?? null,
    items: (document.items ?? []).map((item) => ({
      productId: String(item.productId),
      quantity: item.quantity,
      priceAtAdd: item.priceAtAdd,
      addedAt: item.addedAt,
    })),
    couponCode: document.couponCode ?? null,
    updatedAt: document.updatedAt ?? new Date(),
  };
}
