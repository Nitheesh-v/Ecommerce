import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user.interface.js';

/**
 * Request shape after the request-id middleware has run and, once
 * authentication lands, after the JWT guard has attached a user.
 */
export interface RequestWithContext extends Request {
  requestId?: string;
  user?: AuthenticatedUser;
}
