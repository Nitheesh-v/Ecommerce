import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { RequestWithContext } from '../interfaces/request-with-context.interface.js';

/**
 * The cart id attached by `JwtAuthGuard` on a `@AllowGuest()` route.
 *
 * For a signed-in customer it is their user id (`cart:<userId>` in the document);
 * for an anonymous shopper it is the opaque id their browser sent in `x-cart-id`.
 * Handlers pass it straight back to `CartService`, which resolves pricing from the
 * live catalogue either way — the id only decides *which* cart is read.
 */
export const CartId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<RequestWithContext>();

    return request.cartId ?? '';
  },
);
