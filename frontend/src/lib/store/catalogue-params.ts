import type { CatalogueQuery, StoreSortField } from "@/types/storefront";

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export interface CatalogueParams extends CatalogueQuery {
  page: number;
}

const SORTS: StoreSortField[] = ["createdAt", "price", "name", "rating"];

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();

  return trimmed ? trimmed : undefined;
}

function positiveInt(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);

  return parsed > 0 ? parsed : undefined;
}

/** URL → the query the catalogue is read with. Everything is validated here. */
export function readCatalogueParams(searchParams: SearchParamsRecord): CatalogueParams {
  const sortBy = first(searchParams.sortBy);
  const sortOrder = first(searchParams.sortOrder);
  const minPrice = positiveInt(first(searchParams.minPrice));
  const maxPrice = positiveInt(first(searchParams.maxPrice));

  return {
    search: first(searchParams.search)?.slice(0, 100),
    category: first(searchParams.category),
    minPrice,
    // An inverted band is a typo, not a filter: keep the range readable instead.
    maxPrice: maxPrice !== undefined && minPrice !== undefined && maxPrice < minPrice
      ? minPrice
      : maxPrice,
    inStock: first(searchParams.inStock) === "true",
    onSale: first(searchParams.onSale) === "true",
    minRating: (() => {
      const rating = Number(first(searchParams.minRating));

      return Number.isFinite(rating) && rating > 0 && rating <= 5 ? rating : undefined;
    })(),
    sortBy: SORTS.includes(sortBy as StoreSortField)
      ? (sortBy as StoreSortField)
      : "createdAt",
    sortOrder: sortOrder === "asc" ? "asc" : "desc",
    page: positiveInt(first(searchParams.page)) ?? 1,
    limit: 12,
  };
}

/**
 * Params → a URL.
 *
 * `page` is dropped whenever a filter changes: staying on page 4 of a filter you
 * just narrowed is how a catalogue shows an empty screen.
 */
export function buildCatalogueHref(
  params: Partial<CatalogueParams>,
  base = "/products",
): string {
  const search = new URLSearchParams();

  if (params.search) search.set("search", params.search);
  if (params.category) search.set("category", params.category);
  if (params.minPrice !== undefined) search.set("minPrice", String(params.minPrice));
  if (params.maxPrice !== undefined) search.set("maxPrice", String(params.maxPrice));
  if (params.inStock) search.set("inStock", "true");
  if (params.onSale) search.set("onSale", "true");
  if (params.minRating !== undefined) search.set("minRating", String(params.minRating));
  if (params.sortBy && params.sortBy !== "createdAt") search.set("sortBy", params.sortBy);
  if (params.sortOrder && params.sortOrder !== "desc") search.set("sortOrder", params.sortOrder);
  if (params.page && params.page > 1) search.set("page", String(params.page));

  const query = search.toString();

  return query ? `${base}?${query}` : base;
}

/** How many filters (not sorting or paging) are currently narrowing the list. */
export function countActiveFilters(params: CatalogueParams): number {
  return [
    params.category,
    params.minPrice,
    params.maxPrice,
    params.inStock,
    params.onSale,
    params.minRating,
  ].filter((value) => value !== undefined && value !== false).length;
}
