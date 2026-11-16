import Image from "next/image";
// src/components/store/home/category-showcase.tsx

import Link from "next/link";
import { ArrowUpRight, FolderTree } from "lucide-react";
import { resolveImageUrl } from "@/lib/images";
import type { CategoryNode } from "@/types/category";

/**
 * The category wall.
 *
 * Tall tiles with the photograph doing the work, the name over a gradient and an
 * arrow that only appears on hover — the same information as a card grid, with far
 * more page presence. Categories without an image fall back to a typographic tile
 * rather than an empty grey box.
 */
export function CategoryShowcase({
  categories,
  total,
}: {
  categories: CategoryNode[];
  total?: number;
}) {
  if (categories.length === 0) {
    return null;
  }

  const shown = categories.slice(0, 4);

  return (
    <section className="reveal space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-cream-300 pb-3">
        <div>
          <p className="text-[10px] font-medium tracking-[0.24em] text-bark-500 uppercase">
            Browse
          </p>
          <h2 className="font-display mt-1.5 text-3xl leading-none text-bark-950 sm:text-[34px]">
            Shop by category
          </h2>
        </div>
        <Link
          href="/categories"
          className="group inline-flex items-center gap-1 text-xs font-medium tracking-wide text-bark-700 uppercase hover:text-bark-950"
        >
          All {total && total > shown.length ? `${total} categories` : "categories"}
          <ArrowUpRight
            className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {shown.map((category) => {
          const image = resolveImageUrl(category.image?.url);

          return (
            <Link
              key={category.id}
              href={`/categories/${category.slug}`}
              className="group relative block aspect-[3/4] overflow-hidden rounded-[24px] border border-cream-300 bg-cream-200"
            >
              {image ? (
                <Image
                  src={image}
                  alt={category.image?.alt ?? category.name}
                  fill
                  sizes="(min-width: 1024px) 25vw, 50vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
                />
              ) : (
                <span className="flex h-full items-center justify-center p-4">
                  <FolderTree className="h-8 w-8 text-bark-300" aria-hidden />
                </span>
              )}

              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bark-950/85 via-bark-950/30 to-transparent px-4 pt-14 pb-4">
                <span className="font-display block text-lg leading-tight text-cream-50">
                  {category.name}
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-cream-300">
                    {category.productCount} product{category.productCount === 1 ? "" : "s"}
                  </span>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cream-50/15 text-cream-50 opacity-0 transition-all duration-300 group-hover:opacity-100">
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
