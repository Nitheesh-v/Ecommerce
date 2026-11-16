// src/modules/cart/repositories/cart.repository.ts

/**
 * Cart persistence (abstract class = Nest DI token).
 *
 * A cart is addressed by an **owner id** that is either `cart:<userId>` (a
 * signed-in customer) or `guest:<token>` (an anonymous shopper). One collection,
 * one shape — the difference is only which key the lookups use, and the prefix
 * makes one impossible to mistake for the other. See
 * `common/utils/cart-identity.util.ts`.
 *
 * The whole item list is written at once: a cart is one small document and every
 * mutation has already been validated against stock, so a partial update would only
 * add a new way to end up half-consistent.
 */

export interface CartItemRecord {
  productId: string;
  quantity: number;
  priceAtAdd: number;
  addedAt: Date;
}

export interface CartRecord {
  id: string;
  /** `cart:<userId>` or `guest:<token>`. */
  ownerId: string;
  /** Set only for an account's cart; `null` for a guest's. */
  userId: string | null;
  /**
   * A guest token is a bearer credential, so a claimed cart is retired the moment
   * an account takes it over: the browser keeps the old token, and replaying it
   * must not resurrect someone else's basket.
   */
  retiredAt: Date | null;
  items: CartItemRecord[];
  couponCode: string | null;
  updatedAt: Date;
}

export abstract class CartsRepository {
  abstract findByOwner(ownerId: string): Promise<CartRecord | null>;

  /** Hides a guest cart whose contents have been merged into an account. */
  abstract retire(ownerId: string): Promise<void>;

  /** Creates or replaces the cart for this owner. */
  abstract save(
    ownerId: string,
    items: CartItemRecord[],
    couponCode: string | null,
  ): Promise<CartRecord>;

  /** Stores (or clears) the applied coupon without touching the items. */
  abstract setCoupon(ownerId: string, couponCode: string | null): Promise<void>;

  abstract clear(ownerId: string): Promise<void>;
}
