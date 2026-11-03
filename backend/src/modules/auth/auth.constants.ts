import type { CookieOptions } from 'express';

/** Name of the HttpOnly cookie carrying the refresh token. */
export const REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * The cookie is only sent to auth endpoints, so it never travels with ordinary
 * API calls or page requests.
 */
export const REFRESH_COOKIE_PATH = '/api/auth';

export const ACCESS_TOKEN_TYPE = 'Bearer';

/**
 * Refresh cookie options.
 *
 * - `httpOnly` — JavaScript cannot read it, so XSS cannot exfiltrate it.
 * - `secure` — HTTPS only, outside local development.
 * - `sameSite: 'lax'` — cross-site POSTs are not sent with the cookie, which is
 *   the CSRF protection for the refresh endpoint.
 * - `path` — scoped to `/api/auth`.
 */
export function buildRefreshCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
  };
}

/** Same attributes, without `expires`, so `clearCookie` matches the original. */
export function buildClearedCookieOptions(isProduction: boolean): CookieOptions {
  return buildRefreshCookieOptions(isProduction);
}
