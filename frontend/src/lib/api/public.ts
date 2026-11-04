/**
 * Server-side reader for the public (storefront) API.
 *
 * The storefront renders on the server for SEO, so it cannot use the browser
 * Axios client (which owns the in-memory access token and refresh flow). This
 * helper is intentionally small: `fetch`, the same response envelope, and a
 * cache window (see `catalog.service.ts`, which marks its reads with
 * `'use cache'`) so pages are not rebuilt on every request.
 */

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api"
).replace(/\/+$/, "");

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export class StorefrontApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "StorefrontApiError";
  }
}

function buildUrl(path: string, params?: Record<string, string | number | undefined>) {
  const url = new URL(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

interface FetchOptions<T> {
  /**
   * Value used when the API cannot be reached at all (network error).
   *
   * List pages pass an empty collection so a restarting API renders an empty
   * catalogue instead of a 500 — and so `next build` never depends on the API
   * being up. Detail reads omit it and surface the failure.
   */
  fallback?: T;
}

/** Returns the full envelope so callers can read `meta` (pagination). */
export async function fetchPublicEnvelope<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  options: FetchOptions<T> = {},
): Promise<ApiEnvelope<T>> {
  let response: Response;

  try {
    response = await fetch(buildUrl(path, params), {
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (options.fallback !== undefined) {
      return { success: true, data: options.fallback };
    }

    throw error;
  }

  if (!response.ok) {
    throw new StorefrontApiError(response.status, `API responded ${response.status}`);
  }

  return (await response.json()) as ApiEnvelope<T>;
}

export async function fetchPublic<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  options: FetchOptions<T> = {},
): Promise<T> {
  return (await fetchPublicEnvelope<T>(path, params, options)).data;
}

/** `true` for a 404 from the API (used to render `notFound()` pages). */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof StorefrontApiError && error.status === 404;
}
