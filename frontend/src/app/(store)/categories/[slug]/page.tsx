import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FolderTree } from "lucide-react";
import { ProductCard } from "@/components/store/product-card";
import { resolveImageUrl } from "@/lib/images";
import { catalogService } from "@/services/store/catalog.service";
import type { CategoryPageView } from "@/types/category";

const PAGE_SIZE = 12;


interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

/** SEO comes from the category record, falling back to name/description. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await catalogService.categoryPage(slug).catch(() => null);

  if (!category) {
    // Throwing `notFound()` here (rather than only in the page) makes the HTTP
    // status 404 instead of 200-with-a-404-body, which matters for crawlers.
    notFound();
  }

  return {
    title: category.seoTitle ?? category.name,
    description: category.seoDescription ?? category.description,
  };
}

/**
 * The page shell is static; `params`/`searchParams` are request-time data, so
 * they are read inside a Suspense boundary (the Cache Components pattern).
 */
export default function CategoryPage({ params, searchParams }: PageProps) {
  return (
    <Suspense fallback={<CategorySkeleton />}>
      <CategoryContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CategoryContent({ params, searchParams }: PageProps) {
  const { slug } = await params;

  const category = await catalogService.categoryPage(slug);

  // Inactive categories — and children of inactive parents — are 404s, exactly
  // like the API: the storefront never advertises something switched off.
  if (!category) {
    notFound();
  }

  const hero = resolveImageUrl(category.image?.url);

  return (
    <div className="space-y-8">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1 text-xs text-slate-500"
      >
        <Link href="/" className="hover:underline">
          Home
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <Link href="/categories" className="hover:underline">
          Categories
        </Link>
        {category.breadcrumb.map((ancestor) => (
          <span key={ancestor.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" aria-hidden />
            <Link href={`/categories/${ancestor.slug}`} className="hover:underline">
              {ancestor.name}
            </Link>
          </span>
        ))}
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span className="font-medium text-slate-700">{category.name}</span>
      </nav>

      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hero}
              alt={category.image?.alt ?? category.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <FolderTree className="h-8 w-8 text-slate-300" aria-hidden />
          )}
        </div>

        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {category.name}
          </h1>
          {category.description ? (
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              {category.description}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-slate-500">
            {category.productCount} product{category.productCount === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      {category.children.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Subcategories
          </h2>
          <div className="flex flex-wrap gap-2">
            {category.children.map((child) => (
              <Link
                key={child.id}
                href={`/categories/${child.slug}`}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                {child.name}
                <span className="ml-1.5 text-slate-400">{child.productCount}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {category.siblings.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Related categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {category.siblings.map((sibling) => (
              <Link
                key={sibling.id}
                href={`/categories/${sibling.slug}`}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                {sibling.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* `searchParams` is request-time data, so the paginated grid streams in
          behind a Suspense boundary instead of blocking the page shell. */}
      <Suspense fallback={<ProductGridSkeleton />}>
        <CategoryProducts category={category} pageParam={searchParams} />
      </Suspense>
    </div>
  );
}

async function CategoryProducts({
  category,
  pageParam,
}: {
  category: CategoryPageView;
  pageParam: Promise<{ page?: string }>;
}) {
  const { page: pageValue } = await pageParam;
  const page = Math.max(1, Number.parseInt(pageValue ?? "1", 10) || 1);
  const { items, meta } = await catalogService.categoryProducts(
    category.slug,
    page,
    PAGE_SIZE,
  );

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">
          No products in this category yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      {meta.totalPages > 1 ? (
        <nav className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm">
          {meta.hasPreviousPage ? (
            <Link
              href={`/categories/${category.slug}?page=${meta.page - 1}`}
              className="font-medium text-slate-700 hover:underline"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-slate-500">
            Page {meta.page} of {meta.totalPages}
          </span>
          {meta.hasNextPage ? (
            <Link
              href={`/categories/${category.slug}?page=${meta.page + 1}`}
              className="font-medium text-slate-700 hover:underline"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

function CategorySkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-3 w-64 animate-pulse rounded bg-slate-200" />
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="h-28 w-28 animate-pulse rounded-2xl bg-slate-200" />
        <div className="space-y-2">
          <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
          <div className="h-3 w-72 animate-pulse rounded bg-slate-200" />
        </div>
      </div>
      <ProductGridSkeleton />
    </div>
  );
}

function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="aspect-square animate-pulse rounded-xl border border-slate-200 bg-white"
        />
      ))}
    </div>
  );
}
