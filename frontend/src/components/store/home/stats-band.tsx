// src/components/store/home/stats-band.tsx

import type { ProductFacets } from "@/types/storefront";

/**
 * Four numbers the catalogue actually knows.
 *
 * They come from the public facets endpoint — the same aggregate the browse sidebar
 * filters with — so they are counts of published products, not marketing figures.
 * Nothing here is hard-coded, and the band disappears if the API is unreachable.
 */
export function StatsBand({ facets }: { facets: ProductFacets | null }) {
  if (!facets) {
    return null;
  }

  const stats = [
    { value: facets.total, label: "Products published", hint: "Live in the catalogue" },
    {
      value: facets.categories.length,
      label: "Categories",
      hint: "Every one browsable",
    },
    { value: facets.inStock, label: "In stock now", hint: "Counted from the ledger" },
    { value: facets.onSale, label: "On sale", hint: "List price beaten" },
  ];

  if (stats.every((stat) => stat.value === 0)) {
    return null;
  }

  return (
    <section className="reveal overflow-hidden rounded-[28px] border border-cream-300 bg-cream-200/70">
      <div className="grid grid-cols-2 gap-px bg-cream-300 sm:grid-cols-4">
        {stats.map(({ value, label, hint }) => (
          <div key={label} className="bg-cream-50 px-5 py-7 text-center sm:px-4">
            <p className="font-display text-4xl leading-none text-bark-950 tabular-nums sm:text-5xl">
              {value.toLocaleString("en-IN")}
            </p>
            <p className="mt-2 text-[11px] font-semibold tracking-[0.16em] text-bark-800 uppercase">
              {label}
            </p>
            <p className="mt-1 text-[11px] text-bark-500">{hint}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
