import { SetMetadata } from '@nestjs/common';
import { ALLOW_GUEST_KEY } from '../constants/metadata-keys.js';

/**
 * Lets an anonymous shopper use a cart route.
 *
 * The global `JwtAuthGuard` still runs and still rejects a missing token, unless
 * the route says how it identifies the caller instead: `x-cart-id` for the cart,
 * `x-guest-checkout` for checkout. The guard then attaches that identity, so every
 * downstream handler works with one shape and no handler has to know whether the
 * customer has an account.
 *
 * Deny-by-default is unchanged — this is an explicit opt-in per route, exactly
 * like `@Public()`, and it never grants access to another customer's data.
 */
export const AllowGuest = () => SetMetadata(ALLOW_GUEST_KEY, true);
