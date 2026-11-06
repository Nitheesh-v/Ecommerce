// src/modules/addresses/repositories/addresses.repository.ts

export interface AddressRecord {
  id: string;
  userId: string;
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

export interface CreateAddressInput {
  userId: string;
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export type UpdateAddressInput = Partial<Omit<CreateAddressInput, 'userId'>>;

/**
 * Persistence boundary for saved addresses (abstract class = Nest DI token).
 *
 * Every read takes the owner's id: an address belonging to somebody else must be
 * indistinguishable from a missing one, and that rule belongs in the query, not in
 * a caller who might forget it.
 */
export abstract class AddressesRepository {
  abstract list(userId: string): Promise<AddressRecord[]>;

  abstract countFor(userId: string): Promise<number>;

  /** Scoped read: another customer's address is `null`, exactly like a missing one. */
  abstract findOwned(id: string, userId: string): Promise<AddressRecord | null>;

  abstract create(input: CreateAddressInput): Promise<AddressRecord>;

  abstract update(
    id: string,
    userId: string,
    input: UpdateAddressInput,
  ): Promise<AddressRecord | null>;

  abstract remove(id: string, userId: string): Promise<boolean>;

  /** Clears the default flag for every other address of this customer. */
  abstract clearDefault(userId: string, exceptId?: string): Promise<void>;
}
