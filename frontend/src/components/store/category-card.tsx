import Image from "next/image";
// src/components/store/category-card.tsx

import Link from "next/link";
import { FolderTree } from "lucide-react";
import { resolveImageUrl } from "@/lib/images";
import type { CategoryNode } from "@/types/category";

/** Card used on the landing page and the category index. */
export function CategoryCard({ category }: { category: CategoryNode }) {
  const image = resolveImageUrl(category.image?.url);

  return (
    <Link
      href={`/categories/${category.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 transition-all duration-300 hover:-translate-y-0.5 hover:border-cream-400 hover:shadow-[0_22px_45px_-28px_rgba(58,34,22,0.5)]"
    >
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-cream-200">
        {image ? (
          <Image
            src={image}
            alt={category.image?.alt ?? category.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <FolderTree className="h-8 w-8 text-bark-300" aria-hidden />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="font-display text-base text-bark-900">{category.name}</span>
        <span className="text-[11px] text-bark-500">
          {category.productCount} product{category.productCount === 1 ? "" : "s"}
          {category.children.length > 0
            ? ` · ${category.children.length} subcategor${category.children.length === 1 ? "y" : "ies"}`
            : ""}
        </span>
      </div>
    </Link>
  );
}
