"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, X } from "lucide-react";
import { useState } from "react";
import { cn, formatCompactNumber, formatCurrency } from "@/lib/utils";
import { buildCatalogueHref, type CatalogueParams } from "@/lib/store/catalogue-params";
import type { ProductFacets } from "@/types/storefront";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="group border-b border-slate-100 py-3 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
        {title}
        <span className="text-slate-300 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-3 space-y-2">{children}</div>
    </details>
  );
}

function Choice({
  label,
  meta,
  selected,
  onClick,
}: {
  label: React.ReactNode;
  meta?: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        selected
          ? "bg-slate-900 font-medium text-white"
          : "text-slate-700 hover:bg-slate-100",
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5 truncate">{label}</span>
      {meta ? (
        <span className={cn("shrink-0 text-[11px]", selected ? "text-slate-300" : "text-slate-400")}>
          {meta}
        </span>
      ) : null}
    </button>
  );
}

/** Price bands derived from the real catalogue bounds — never invented. */
function priceBands(min: number, max: number) {
  if (max <= min) {
    return [];
  }

  const step = Math.max(1, Math.round((max - min) / 4));

  return [
    { label: `Under ${formatCurrency(min + step)}`, min: undefined, max: min + step },
    {
      label: `${formatCurrency(min + step)} – ${formatCurrency(min + step * 2)}`,
      min: min + step,
      max: min + step * 2,
    },
    {
      label: `${formatCurrency(min + step * 2)} – ${formatCurrency(min + step * 3)}`,
      min: min + step * 2,
      max: min + step * 3,
    },
    {
      label: `${formatCurrency(min + step * 3)} & above`,
      min: min + step * 3,
      max: undefined,
    },
  ];
}

/**
 * Catalogue filters, driven entirely by the URL.
 *
 * Every click navigates (server render), which keeps the list, the back button and a
 * shared link in agreement — and means the sidebar cannot drift from the results.
 */
export function FilterSidebar({
  facets,
  params,
}: {
  facets: ProductFacets | null;
  params: CatalogueParams;
}) {
  const router = useRouter();
  const [min, setMin] = useState(params.minPrice ? String(params.minPrice / 100) : "");
  const [max, setMax] = useState(params.maxPrice ? String(params.maxPrice / 100) : "");

  const go = (changes: Partial<CatalogueParams>) => {
    router.push(buildCatalogueHref({ ...params, ...changes, page: 1 }));
  };

  const applyPrice = () => {
    const minMinor = min.trim() ? Math.round(Number(min) * 100) : undefined;
    const maxMinor = max.trim() ? Math.round(Number(max) * 100) : undefined;

    go({
      minPrice: Number.isFinite(minMinor) ? minMinor : undefined,
      maxPrice: Number.isFinite(maxMinor) ? maxMinor : undefined,
    });
  };

  if (!facets) {
    return (
      <aside className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Filters are unavailable right now.
      </aside>
    );
  }

  const bands = priceBands(facets.price.min, facets.price.max);

  return (
    <aside className="rounded-xl border border-slate-200 bg-white px-4 py-1">
      <div className="flex items-center justify-between border-b border-slate-100 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Filters</h2>
        <Link
          href="/products"
          className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900"
        >
          <X className="h-3 w-3" aria-hidden />
          Clear all
        </Link>
      </div>

      {facets.categories.length > 0 ? (
        <Section title="Category">
          {params.category ? (
            <Choice
              label="All categories"
              selected={false}
              onClick={() => go({ category: undefined })}
            />
          ) : null}
          {facets.categories.map((category) => (
            <Choice
              key={category.id}
              label={category.name}
              meta={formatCompactNumber(category.count)}
              selected={params.category === category.slug}
              onClick={() =>
                go({
                  category: params.category === category.slug ? undefined : category.slug,
                  // A new category starts from its own price range, not the old one.
                  minPrice: undefined,
                  maxPrice: undefined,
                })
              }
            />
          ))}
        </Section>
      ) : null}

      <Section title="Price">
        {bands.map((band) => {
          const selected =
            params.minPrice === band.min && params.maxPrice === band.max;

          return (
            <Choice
              key={band.label}
              label={band.label}
              selected={selected}
              onClick={() =>
                go({ minPrice: band.min, maxPrice: band.max })
              }
            />
          );
        })}

        <div className="flex items-center gap-1.5 pt-1">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={min}
            onChange={(event) => setMin(event.target.value)}
            placeholder="Min"
            aria-label="Minimum price"
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-slate-400 focus:outline-none"
          />
          <span className="text-slate-300">–</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={max}
            onChange={(event) => setMax(event.target.value)}
            placeholder="Max"
            aria-label="Maximum price"
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={applyPrice}
            className="rounded-md bg-slate-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            Go
          </button>
        </div>
      </Section>

      <Section title="Customer rating">
        {[4, 3].map((rating) => {
          const bucket = facets.ratings.find((row) => row.min === rating);
          const selected = params.minRating === rating;

          return (
            <Choice
              key={rating}
              label={
                <span className="flex items-center gap-1">
                  {rating}
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                  &amp; above
                </span>
              }
              meta={bucket ? formatCompactNumber(bucket.count) : "0"}
              selected={selected}
              onClick={() => go({ minRating: selected ? undefined : rating })}
            />
          );
        })}
      </Section>

      <Section title="Availability">
        <Choice
          label="In stock"
          meta={formatCompactNumber(facets.inStock)}
          selected={Boolean(params.inStock)}
          onClick={() => go({ inStock: params.inStock ? undefined : true })}
        />
        <Choice
          label="On sale"
          meta={formatCompactNumber(facets.onSale)}
          selected={Boolean(params.onSale)}
          onClick={() => go({ onSale: params.onSale ? undefined : true })}
        />
      </Section>
    </aside>
  );
}
