import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CategoryCard } from "@/components/store/category-card";
import { ProductCard } from "@/components/store/product-card";
import { catalogService } from "@/services/store/catalog.service";

export const metadata: Metadata = {
  title: "Shop by category",
  description: "Browse the Ecommerce26 catalogue by category.",
};

export default async function StoreHomePage() {
  const [categories, featured] = await Promise.all([
    catalogService.categoryTree(),
    catalogService.featuredProducts(4),
  ]);

  return (
    <div className="space-y-12">
      <section className="rounded-2xl bg-slate-900 px-6 py-10 text-white sm:px-10">
        <p className="text-xs font-medium tracking-wide text-slate-300 uppercase">
          Ecommerce26
        </p>
        <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Everything you need, organised the way you shop.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-300">
          Browse by category or jump straight into the departments below.
        </p>
        <Link
          href="/categories"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
        >
          Browse all categories
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Shop by category
          </h2>
          <Link href="/categories" className="text-xs font-medium text-slate-600 hover:underline">
            View all
          </Link>
        </div>

        {categories.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
            No categories are published yet. Add one in the admin console.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {categories.slice(0, 8).map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        )}
      </section>

      {featured.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Featured products
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
