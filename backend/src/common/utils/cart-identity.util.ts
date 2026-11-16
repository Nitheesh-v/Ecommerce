// src/common/utils/cart-identity.util.ts

/**
 * Cart identity helpers.
 *
 * A cart id is namespaced because one collection holds two kinds of owner:
 *
 *   cart:<userId>  — a signed-in customer's cart (the historical key: it was the
 *                    bare user id before guest carts existed)
 *   guest:<token>  — an anonymous shopper's cart, where `<token>` is a random
 *                    value the browser stores and sends in `x-cart-id`
 *
 * Namespacing matters for one specific reason: a guest token must never be able to
 * name a signed-in customer's cart, and a user id must never be mistaken for a
 * guest token. The prefix makes both impossible by construction.
 */

export const GUEST_PREFIX = 'guest:';
export const USER_PREFIX = 'cart:';

/** Guest tokens are 32 random bytes, base64url (see `crypto.randomBytes`). */
const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,64}$/;

export const GUEST_CART_HEADER = 'x-cart-id';
export const GUEST_CHECKOUT_HEADER = 'x-guest-checkout';

/** Older documents stored the bare user id; the repository accepts both. */
export function userCartId(userId: string): string {
  return `${USER_PREFIX}${userId}`;
}

export function guestCartId(token: string): string {
  return `${GUEST_PREFIX}${token}`;
}

export function isGuestCartId(cartId: string): boolean {
  return cartId.startsWith(GUEST_PREFIX);
}

export function isUserCartId(cartId: string): boolean {
  return cartId.startsWith(USER_PREFIX);
}

/** `cart:<id>` or the bare id a pre-guest document used. */
export function userIdOfCart(cartId: string): string | null {
  if (isUserCartId(cartId)) {
    return cartId.slice(USER_PREFIX.length);
  }

  return isGuestCartId(cartId) ? null : cartId;
}

/** The raw guest token, or `null` when the id belongs to an account. */
export function guestTokenOfCart(cartId: string): string | null {
  return isGuestCartId(cartId) ? cartId.slice(GUEST_PREFIX.length) : null;
}

export function isWellFormedGuestToken(value: string): boolean {
  return GUEST_TOKEN_PATTERN.test(value);
}

/**
 * Resolves what the request says the caller's cart is, authenticating it with the
 * one thing a cart needs: the token.
 *
 * Returns `null` when there is nothing usable to authenticate, so the guard can
 * answer 401 rather than inventing an identity.
 */
export function resolveCartId(input: {
  userId?: string | undefined;
  cartHeader?: string | string[] | undefined;
  guestCheckoutHeader?: string | string[] | undefined;
}): string | null {
  if (input.userId) {
    return userCartId(input.userId);
  }

  const raw = firstValue(input.cartHeader) ?? firstValue(input.guestCheckoutHeader);

  if (!raw) {
    return null;
  }

  const token = raw.startsWith(GUEST_PREFIX) ? raw.slice(GUEST_PREFIX.length) : raw;

  return isWellFormedGuestToken(token) ? guestCartId(token) : null;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }

  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
