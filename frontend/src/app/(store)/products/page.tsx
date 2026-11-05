import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, SlidersHorizontal } from "lucide-react";
import { ActiveFilters } from "@/components/store/catalogue/active-filters";
import { FilterSidebar } from "@/components/store/catalogue/filter-sidebar";
import { PaginationLinks } from "@/components/store/catalogue/pagination-links";
import { SortSelect } from "@/components/store/catalogue/sort-select";
import { ProductCard } from "@/components/store/product-card";
import {
  buildCatalogueHref,
  countActiveFilters,
  readCatalogueParams,
  type SearchParamsRecord,
} from "@/lib/store/catalogue-params";
import { catalogService } from "@/services/store/catalog.service";

/**
 * The catalogue reads `searchParams`, which is request data. Marking the route as
 * blocking is the same trade the admin console makes: correctness over a prerendered
 * shell, because the whole page *is* the query.
 */
export const instant = false;

interface PageProps {
  searchParams: Promise<SearchParamsRecord>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = readCatalogueParams(await searchParams);
  const title = params.search
    ? `Search results for “${params.search}”`
    : params.category
      ? `${params.category.replace(/-/g, " ")} — shop online`
      : "All products";

  return {
    title,
    description:
      "Browse the catalogue with live prices, stock and customer ratings. Filter by category, price, rating and availability.",
  };
}

/**
 * Catalogue browse — the Flipkart-shaped page.
 *
 * Filters, sorting and paging all live in the URL and are resolved on the server, so
 * the grid a customer sees is exactly what the API returned for that link: no client
 * fetch waterfall, no state that disagrees with the address bar.
 */
export default async function ProductsPage({ searchParams }: PageProps) {
  const params = readCatalogueParams(await searchParams);

  const [page, facets] = await Promise.all([
    catalogService.browse(params),
    catalogService.facets(),
  ]);

  const heading = params.search
    ? `Results for “${params.search}”`
    : params.category
      ? (facets?.categories.find((row) => row.slug === params.category)?.name ??
        params.category.replace(/-/g, " "))
      : "All products";

  const filterCount = countActiveFilters(params);
  const firstResult = page.meta.total === 0 ? 0 : (page.meta.page - 1) * page.meta.limit + 1;
  const lastResult = Math.min(page.meta.page * page.meta.limit, page.meta.total);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{heading}</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {page.meta.total === 0
              ? "No products match these filters"
              : `Showing ${firstResult}–${lastResult} of ${page.meta.total.toLocaleString("en-IN")} products`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <SortSelect params={params} />
        </div>
      </div>

      {params.search || filterCount > 0 ? (
        <ActiveFilters params={params} facets={facets} />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
        {/* Mobile: collapsed disclosure. Desktop: sticky sidebar. */}
        <div className="lg:hidden">
          <details className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-800">
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Filters
              {filterCount > 0 ? (
                <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {filterCount}
                </span>
              ) : null}
            </summary>
            <div className="mt-3">
              <FilterSidebar facets={facets} params={params} />
            </div>
          </details>
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-20">
            <FilterSidebar facets={facets} params={params} />
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          {page.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <SearchX className="mx-auto h-6 w-6 text-slate-300" aria-hidden />
              <h2 className="mt-3 text-base font-semibold text-slate-900">
                Nothing matched
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                Try a broader price range, a different category, or remove a filter.
              </p>
              <Link
                href="/products"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 underline underline-offset-2"
              >
                Browse everything
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
              {page.items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          <PaginationLinks meta={page.meta} params={params} />

          {page.items.length > 0 ? (
            <p className="text-center text-xs text-slate-400">
              <Link href={buildCatalogueHref({ ...params, page: 1 })} className="hover:underline">
                Back to the first page
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
