import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../constants/metadata-keys.js';
import type { Role } from '../enums/role.enum.js';

/**
 * Restricts a route to the given roles, e.g. `@Roles(Role.Admin)`.
 *
 * Enforced on the server by the roles guard (Phase 4) — never by the frontend
 * alone.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
