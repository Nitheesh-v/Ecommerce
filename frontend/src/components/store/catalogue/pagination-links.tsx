import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildCatalogueHref, type CatalogueParams } from "@/lib/store/catalogue-params";
import type { ProductPage } from "@/types/storefront";

/** Link-based paging: every page is a real URL, so it can be crawled and shared. */
export function PaginationLinks({
  meta,
  params,
}: {
  meta: ProductPage["meta"];
  params: CatalogueParams;
}) {
  if (meta.totalPages <= 1) {
    return null;
  }

  const pages = pageWindow(meta.page, meta.totalPages);
  const href = (page: number) => buildCatalogueHref({ ...params, page });

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-center gap-1 pt-2"
    >
      {meta.hasPreviousPage ? (
        <Link
          href={href(meta.page - 1)}
          rel="prev"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Prev
        </Link>
      ) : null}

      {pages.map((page, index) =>
        page === null ? (
          <span key={`gap-${index}`} className="px-1 text-xs text-slate-400">
            …
          </span>
        ) : (
          <Link
            key={page}
            href={href(page)}
            aria-current={page === meta.page ? "page" : undefined}
            className={
              page === meta.page
                ? "inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-slate-900 px-2 text-xs font-semibold text-white"
                : "inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            }
          >
            {page}
          </Link>
        ),
      )}

      {meta.hasNextPage ? (
        <Link
          href={href(meta.page + 1)}
          rel="next"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : null}
    </nav>
  );
}

/** First, last and a window around the current page; `null` renders an ellipsis. */
function pageWindow(current: number, total: number): (number | null)[] {
  const wanted = new Set<number>([1, total, current]);

  for (const offset of [-1, 1]) {
    const page = current + offset;

    if (page >= 1 && page <= total) {
      wanted.add(page);
    }
  }

  const ordered = [...wanted].sort((a, b) => a - b);
  const result: (number | null)[] = [];

  ordered.forEach((page, index) => {
    if (index > 0 && page - ordered[index - 1] > 1) {
      result.push(null);
    }

    result.push(page);
  });

  return result;
}
