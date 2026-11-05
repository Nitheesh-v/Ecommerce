import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ImageOff } from "lucide-react";
import { CouponField } from "@/components/store/coupon-field";
import { ProductReviews } from "@/components/store/product-reviews";
import { resolveImageUrl } from "@/lib/images";
import { formatCurrency } from "@/lib/utils";
import { catalogService } from "@/services/store/catalog.service";

/** The product detail page is what a category page links to, so it lives here. */
interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await catalogService.product(slug).catch(() => null);

  if (!product) {
    notFound();
  }

  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.shortDescription,
  };
}

/** Shell is static; `params` are request-time data, so they load in Suspense. */
export default function ProductPage({ params }: PageProps) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

async function ProductContent({ params }: PageProps) {
  const { slug } = await params;
  const product = await catalogService.product(slug);

  // Drafts and archived products are 404s: only published products are public.
  if (!product) {
    notFound();
  }

  const primary = resolveImageUrl(
    product.images.find((image) => image.isPrimary)?.url ?? product.images[0]?.url,
  );
  const discounted = Boolean(product.salePrice && product.salePrice < product.price);

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
        <Link href="/" className="hover:underline">
          Home
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <Link href="/categories" className="hover:underline">
          Categories
        </Link>
        {product.category ? (
          <>
            <ChevronRight className="h-3 w-3" aria-hidden />
            <Link
              href={`/categories/${product.category.slug}`}
              className="hover:underline"
            >
              {product.category.name}
            </Link>
          </>
        ) : null}
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span className="font-medium text-slate-700">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {primary ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={primary}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageOff className="h-8 w-8 text-slate-300" aria-hidden />
          )}
        </div>

        <div className="space-y-4">
          {product.brand ? (
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              {product.brand}
            </p>
          ) : null}

          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {product.name}
          </h1>

          {product.shortDescription ? (
            <p className="text-sm text-slate-600">{product.shortDescription}</p>
          ) : null}

          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-semibold text-slate-900">
              {formatCurrency(product.effectivePrice)}
            </span>
            {discounted ? (
              <span className="text-sm text-slate-400 line-through">
                {formatCurrency(product.price)}
              </span>
            ) : null}
          </div>

          <p
            className={
              product.inStock
                ? "text-xs font-medium text-emerald-600"
                : "text-xs font-medium text-rose-600"
            }
          >
            {product.inStock ? "In stock" : "Out of stock"}
          </p>

          <div className="border-t border-slate-200 pt-4">
            {/* Preview only: the discount is priced by the API, and checkout re-quotes. */}
            <CouponField
              lines={[{ productId: product.id, quantity: 1 }]}
              className="mb-4"
            />
            <Link
              href="/offers"
              className="mb-4 inline-block text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              See all current offers
            </Link>
            <h2 className="text-sm font-semibold text-slate-900">Description</h2>
            <p className="mt-1 text-sm whitespace-pre-line text-slate-600">
              {product.description}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-4 text-xs">
            <dt className="text-slate-500">SKU</dt>
            <dd className="text-right font-mono text-slate-700">{product.sku}</dd>
            {product.category ? (
              <>
                <dt className="text-slate-500">Category</dt>
                <dd className="text-right text-slate-700">
                  <Link
                    href={`/categories/${product.category.slug}`}
                    className="hover:underline"
                  >
                    {product.category.name}
                  </Link>
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>

      <ProductReviews productSlug={product.slug} />
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-3 w-64 animate-pulse rounded bg-slate-200" />
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="aspect-square animate-pulse rounded-2xl bg-slate-200" />
        <div className="space-y-3">
          <div className="h-7 w-2/3 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
          <div className="h-20 w-full animate-pulse rounded bg-slate-200" />
        </div>
      </div>
    </div>
  );
}
