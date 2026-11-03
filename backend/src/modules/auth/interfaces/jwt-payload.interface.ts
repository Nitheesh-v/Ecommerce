import type { Role } from '../../../common/enums/role.enum.js';

/** Claims carried by an access token. Intentionally minimal. */
export interface JwtPayload {
  /** User id (hex ObjectId). */
  sub: string;
  email: string;
  role: Role;
  /** Issued-at / expiry are added by the signer. */
  iat?: number;
  exp?: number;
}
