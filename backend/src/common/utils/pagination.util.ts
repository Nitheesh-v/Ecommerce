export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

/** `Math.trunc` that refuses NaN/Infinity, so no `NaN` leaks into a Mongo query. */
function toPositiveInt(value: number, fallback = 1): number {
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : fallback;
}

function toNonNegativeInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/**
 * Number of documents to skip for a 1-based page.
 * Guards against negative/zero/NaN input so a bad query cannot produce `skip: -20`.
 */
export function getSkip(page: number, limit: number): number {
  return (toPositiveInt(page) - 1) * toPositiveInt(limit);
}

/** Builds the pagination metadata returned alongside a page of results. */
export function createPaginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  const safePage = toPositiveInt(page);
  const safeLimit = toPositiveInt(limit);
  const safeTotal = toNonNegativeInt(total);
  const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / safeLimit);

  return {
    page: safePage,
    limit: safeLimit,
    total: safeTotal,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPreviousPage: safePage > 1 && totalPages > 0,
  };
}

/**
 * Convenience wrapper for services: `return createPaginatedResult(items, page, limit, total)`.
 * The response interceptor promotes `meta` to the envelope (`{ success, data, meta }`).
 */
export function createPaginatedResult<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
): PaginatedResult<T> {
  return { data, meta: createPaginationMeta(page, limit, total) };
}
