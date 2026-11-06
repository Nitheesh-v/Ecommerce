// src/modules/cart/repositories/cart.repository.ts

export interface CartItemRecord {
  productId: string;
  quantity: number;
  priceAtAdd: number;
  addedAt: Date;
}

export interface CartRecord {
  id: string;
  userId: string;
  items: CartItemRecord[];
  couponCode: string | null;
  updatedAt: Date;
}

/**
 * Cart persistence (abstract class = Nest DI token).
 *
 * The whole item list is written at once: a cart is one small document and every
 * mutation has already been validated against stock, so a partial update would only
 * add a new way to end up half-consistent.
 */
export abstract class CartsRepository {
  abstract findByUser(userId: string): Promise<CartRecord | null>;

  /** Creates or replaces the cart for this customer. */
  abstract save(
    userId: string,
    items: CartItemRecord[],
    couponCode: string | null,
  ): Promise<CartRecord>;

  /** Stores (or clears) the applied coupon without touching the items. */
  abstract setCoupon(userId: string, couponCode: string | null): Promise<void>;

  abstract clear(userId: string): Promise<void>;
}
