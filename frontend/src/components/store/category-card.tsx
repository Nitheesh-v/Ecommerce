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
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md"
    >
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-slate-100">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={category.image?.alt ?? category.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <FolderTree className="h-8 w-8 text-slate-300" aria-hidden />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-sm font-semibold text-slate-900">{category.name}</span>
        <span className="text-xs text-slate-500">
          {category.productCount} product{category.productCount === 1 ? "" : "s"}
          {category.children.length > 0
            ? ` · ${category.children.length} subcategor${category.children.length === 1 ? "y" : "ies"}`
            : ""}
        </span>
      </div>
    </Link>
  );
}
