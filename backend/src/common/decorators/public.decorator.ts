import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../constants/metadata-keys.js';

/**
 * Marks a route (or controller) as reachable without authentication.
 *
 * The global JWT guard added in Phase 4 rejects everything unless it is marked
 * `@Public()`, so the default is deny.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
