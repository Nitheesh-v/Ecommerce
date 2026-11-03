import type { Role } from '../enums/role.enum.js';

/**
 * The user object attached to a request by the JWT strategy (Phase 4).
 *
 * Deliberately minimal: it is what downstream handlers need, never the database
 * document (which would include the password hash).
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}
