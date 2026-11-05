"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { buildCatalogueHref, type CatalogueParams } from "@/lib/store/catalogue-params";
import { formatCurrency } from "@/lib/utils";
import type { ProductFacets } from "@/types/storefront";

interface Chip {
  key: string;
  label: string;
  clear: Partial<CatalogueParams>;
}

/** Chips for whatever is currently narrowing the list, each removable on its own. */
export function ActiveFilters({
  params,
  facets,
}: {
  params: CatalogueParams;
  facets: ProductFacets | null;
}) {
  const router = useRouter();
  const chips: Chip[] = [];

  if (params.search) {
    chips.push({ key: "search", label: `“${params.search}”`, clear: { search: undefined } });
  }

  if (params.category) {
    const name = facets?.categories.find((row) => row.slug === params.category)?.name;

    chips.push({
      key: "category",
      label: name ?? params.category,
      clear: { category: undefined, minPrice: undefined, maxPrice: undefined },
    });
  }

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    const label =
      params.minPrice !== undefined && params.maxPrice !== undefined
        ? `${formatCurrency(params.minPrice)} – ${formatCurrency(params.maxPrice)}`
        : params.minPrice !== undefined
          ? `From ${formatCurrency(params.minPrice)}`
          : `Under ${formatCurrency(params.maxPrice ?? 0)}`;

    chips.push({ key: "price", label, clear: { minPrice: undefined, maxPrice: undefined } });
  }

  if (params.minRating) {
    chips.push({
      key: "rating",
      label: `${params.minRating}★ & above`,
      clear: { minRating: undefined },
    });
  }

  if (params.inStock) {
    chips.push({ key: "stock", label: "In stock", clear: { inStock: undefined } });
  }

  if (params.onSale) {
    chips.push({ key: "sale", label: "On sale", clear: { onSale: undefined } });
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() =>
            router.push(buildCatalogueHref({ ...params, ...chip.clear, page: 1 }))
          }
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
        >
          {chip.label}
          <X className="h-3 w-3 text-slate-400" aria-hidden />
        </button>
      ))}

      <Link
        href="/products"
        className="text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900"
      >
        Clear all
      </Link>
    </div>
  );
}
