import type { Metadata } from "next";
import Link from "next/link";
import { CategoryCard } from "@/components/store/category-card";
import { catalogService } from "@/services/store/catalog.service";

export const metadata: Metadata = {
  title: "Categories",
  description: "All active categories, with their subcategories.",
};

export default async function CategoriesIndexPage() {
  const categories = await catalogService.categoryTree();

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Categories
        </h1>
        <p className="text-sm text-slate-500">
          {categories.length} department{categories.length === 1 ? "" : "s"} ·{" "}
          {categories.reduce((total, node) => total + node.children.length, 0)}{" "}
          subcategories
        </p>
      </header>

      {categories.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">
          Nothing is published yet.
        </p>
      ) : (
        <div className="space-y-10">
          {categories.map((category) => (
            <section key={category.id} className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                  <Link href={`/categories/${category.slug}`} className="hover:underline">
                    {category.name}
                  </Link>
                </h2>
                <span className="text-xs text-slate-500">
                  {category.productCount} product{category.productCount === 1 ? "" : "s"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {category.children.length > 0 ? (
                  category.children.map((child) => (
                    <CategoryCard key={child.id} category={child} />
                  ))
                ) : (
                  <CategoryCard category={category} />
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
