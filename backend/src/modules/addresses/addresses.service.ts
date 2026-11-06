// src/modules/addresses/addresses.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { AddressesRepository } from './repositories/addresses.repository.js';
import type { AddressRecord } from './repositories/addresses.repository.js';
import type { CreateAddressDto, UpdateAddressDto } from './dto/address.dto.js';

export interface AddressView {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** A customer's address book. Every operation is scoped to the caller. */
@Injectable()
export class AddressesService {
  constructor(private readonly addresses: AddressesRepository) {}

  async list(userId: string): Promise<AddressView[]> {
    return (await this.addresses.list(userId)).map(toView);
  }

  async create(userId: string, dto: CreateAddressDto): Promise<AddressView> {
    const existing = await this.addresses.countFor(userId);
    // The first address is the default whether or not the client said so: a
    // checkout with no default would have nothing to preselect.
    const isDefault = dto.isDefault === true || existing === 0;

    if (isDefault) {
      await this.addresses.clearDefault(userId);
    }

    const created = await this.addresses.create({
      userId,
      label: dto.label?.trim() || 'Home',
      recipientName: dto.recipientName.trim(),
      phone: dto.phone.trim(),
      line1: dto.line1.trim(),
      line2: dto.line2?.trim() || null,
      city: dto.city.trim(),
      state: dto.state.trim(),
      postalCode: dto.postalCode.trim(),
      country: dto.country?.trim() || 'India',
      isDefault,
    });

    return toView(created);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<AddressView> {
    if (dto.isDefault === true) {
      await this.addresses.clearDefault(userId, id);
    }

    const updated = await this.addresses.update(id, userId, {
      label: dto.label?.trim(),
      recipientName: dto.recipientName?.trim(),
      phone: dto.phone?.trim(),
      line1: dto.line1?.trim(),
      line2: dto.line2 === undefined ? undefined : dto.line2.trim() || null,
      city: dto.city?.trim(),
      state: dto.state?.trim(),
      postalCode: dto.postalCode?.trim(),
      country: dto.country?.trim(),
      isDefault: dto.isDefault,
    });

    if (!updated) {
      throw new NotFoundException('Address not found');
    }

    return toView(updated);
  }

  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    const removed = await this.addresses.remove(id, userId);

    if (!removed) {
      throw new NotFoundException('Address not found');
    }

    return { deleted: true };
  }

  /**
   * The address behind an `addressId` at checkout.
   *
   * Somebody else's id and a non-existent id are the same answer (404): an address
   * book is not a place to probe.
   */
  async requireOwned(userId: string, id: string): Promise<AddressRecord> {
    const address = await this.addresses.findOwned(id, userId);

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    return address;
  }
}

function toView(record: AddressRecord): AddressView {
  return {
    id: record.id,
    label: record.label,
    recipientName: record.recipientName,
    phone: record.phone,
    line1: record.line1,
    line2: record.line2,
    city: record.city,
    state: record.state,
    postalCode: record.postalCode,
    country: record.country,
    isDefault: record.isDefault,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
