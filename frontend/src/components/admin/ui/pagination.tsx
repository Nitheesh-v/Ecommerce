"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaginationMeta } from "@/types/auth";

/** Footer for server-paginated tables: range summary + prev/next. */
export function Pagination({
  meta,
  onPageChange,
  disabled = false,
}: {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500">
        {meta.total === 0 ? (
          "No results"
        ) : (
          <>
            Showing <span className="font-medium text-slate-700">{from}</span>–
            <span className="font-medium text-slate-700">{to}</span> of{" "}
            <span className="font-medium text-slate-700">{meta.total}</span>
          </>
        )}
      </p>

      <div className="flex items-center gap-1.5">
        <span className="mr-1 text-xs text-slate-500">
          Page {meta.page} of {Math.max(meta.totalPages, 1)}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(meta.page - 1)}
          disabled={disabled || !meta.hasPreviousPage}
          aria-label="Previous page"
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors",
            "hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(meta.page + 1)}
          disabled={disabled || !meta.hasNextPage}
          aria-label="Next page"
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors",
            "hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
