// src/modules/addresses/repositories/mongoose-addresses.repository.ts

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Types } from 'mongoose';
import type { Model } from 'mongoose';
import { Address } from '../schemas/address.schema.js';
import type { AddressDocument } from '../schemas/address.schema.js';
import { AddressesRepository } from './addresses.repository.js';
import type {
  AddressRecord,
  CreateAddressInput,
  UpdateAddressInput,
} from './addresses.repository.js';

@Injectable()
export class MongooseAddressesRepository implements AddressesRepository {
  constructor(
    @InjectModel(Address.name) private readonly addressModel: Model<Address>,
  ) {}

  async list(userId: string): Promise<AddressRecord[]> {
    const documents = await this.addressModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ isDefault: -1, createdAt: -1 })
      .exec();

    return documents.map(toRecord);
  }

  async countFor(userId: string): Promise<number> {
    return this.addressModel
      .countDocuments({ userId: new Types.ObjectId(userId) })
      .exec();
  }

  async findOwned(id: string, userId: string): Promise<AddressRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const document = await this.addressModel
      .findOne({ _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) })
      .exec();

    return document ? toRecord(document) : null;
  }

  async create(input: CreateAddressInput): Promise<AddressRecord> {
    const created = await this.addressModel.create({
      ...input,
      userId: new Types.ObjectId(input.userId),
      line2: input.line2 ?? null,
    });

    return toRecord(created);
  }

  async update(
    id: string,
    userId: string,
    input: UpdateAddressInput,
  ): Promise<AddressRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const patch = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );

    const updated = await this.addressModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) },
        { $set: patch },
        { new: true },
      )
      .exec();

    return updated ? toRecord(updated) : null;
  }

  async remove(id: string, userId: string): Promise<boolean> {
    if (!isValidObjectId(id)) {
      return false;
    }

    const result = await this.addressModel
      .deleteOne({ _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) })
      .exec();

    return result.deletedCount === 1;
  }

  async clearDefault(userId: string, exceptId?: string): Promise<void> {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      isDefault: true,
    };

    if (exceptId && isValidObjectId(exceptId)) {
      filter._id = { $ne: new Types.ObjectId(exceptId) };
    }

    await this.addressModel.updateMany(filter, { $set: { isDefault: false } }).exec();
  }
}

function toRecord(document: AddressDocument): AddressRecord {
  return {
    id: String(document._id),
    userId: String(document.userId),
    label: document.label,
    recipientName: document.recipientName,
    phone: document.phone,
    line1: document.line1,
    line2: document.line2 ?? null,
    city: document.city,
    state: document.state,
    postalCode: document.postalCode,
    country: document.country,
    isDefault: document.isDefault,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}
