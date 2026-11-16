import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user.interface.js';

/**
 * Request shape after the request-id middleware has run and, once
 * authentication lands, after the JWT guard has attached a user.
 */
export interface RequestWithContext extends Request {
  requestId?: string;
  user?: AuthenticatedUser;
  /**
   * Set by `JwtAuthGuard` on a `@AllowGuest()` route: `cart:<userId>` for a
   * signed-in customer, `guest:<token>` for an anonymous shopper. Absent everywhere
   * else, so a handler that reads it can only be on a route that opted in.
   */
  cartId?: string;
}
