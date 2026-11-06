// src/types/address.ts

/**
 * Saved delivery address — the shape of `GET /api/addresses`.
 *
 * Addresses belong to one customer and every read is owner-scoped on the server,
 * so the browser never needs to pass a user id anywhere.
 */
export interface Address {
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
  /** Exactly one address per customer is the default. */
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Payload for creating or editing an address. */
export interface AddressInput {
  label?: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  isDefault?: boolean;
}
