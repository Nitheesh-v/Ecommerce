"use client";

import { useRouter } from "next/navigation";
import { buildCatalogueHref, type CatalogueParams } from "@/lib/store/catalogue-params";

const OPTIONS = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "price:asc", label: "Price: low to high" },
  { value: "price:desc", label: "Price: high to low" },
  { value: "rating:desc", label: "Customer rating" },
  { value: "name:asc", label: "Name: A to Z" },
] as const;

/** Sorting is a URL change, like every other filter (server-rendered list). */
export function SortSelect({ params }: { params: CatalogueParams }) {
  const router = useRouter();
  const current = `${params.sortBy ?? "createdAt"}:${params.sortOrder ?? "desc"}`;

  return (
    <label className="flex items-center gap-2 text-xs text-slate-500">
      <span className="hidden sm:inline">Sort by</span>
      <select
        value={OPTIONS.some((option) => option.value === current) ? current : "createdAt:desc"}
        onChange={(event) => {
          const [sortBy, sortOrder] = event.target.value.split(":") as [
            CatalogueParams["sortBy"],
            CatalogueParams["sortOrder"],
          ];

          router.push(buildCatalogueHref({ ...params, sortBy, sortOrder, page: 1 }));
        }}
        className="rounded-lg border border-slate-200 bg-white py-1.5 pr-7 pl-2 text-xs font-medium text-slate-800 focus:border-slate-400 focus:outline-none"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
