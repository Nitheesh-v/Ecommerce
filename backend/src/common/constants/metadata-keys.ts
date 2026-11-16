/**
 * Keys used with `SetMetadata` / `Reflector`.
 *
 * Kept in one place so guards, interceptors and decorators cannot drift apart.
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const SKIP_RESPONSE_ENVELOPE_KEY = 'skipResponseEnvelope';

/**
 * Routes that work for a signed-in customer *and* for an anonymous one, using an
 * opaque cart id instead of a user id. Distinct from `IS_PUBLIC_KEY` on purpose:
 * public means "no identity needed", this means "an identity is still required,
 * it just may be a cart rather than an account".
 */
export const ALLOW_GUEST_KEY = 'allowGuest';
