// src/app/(store)/products/[slug]/page.tsx

import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Banknote,
  ChevronRight,
  PackageCheck,
  RotateCcw,
  Star,
  Tag,
} from "lucide-react";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { ProductGallery, type GalleryImage } from "@/components/store/product-gallery";
import { ProductRail } from "@/components/store/product-rail";
import { ProductReviews } from "@/components/store/product-reviews";
import { ShareProduct } from "@/components/store/share-product";
import { StickyBuyBar } from "@/components/store/sticky-buy-bar";
import { CouponField } from "@/components/store/coupon-field";
import { discountPercent } from "@/components/store/product-card";
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

  const [profile, related] = await Promise.all([
    catalogService.storeProfile(),
    product.category
      ? catalogService.categoryProducts(product.category.slug, 1, 6)
      : Promise.resolve(null),
  ]);

  const images: GalleryImage[] = product.images.flatMap((image) => {
    const url = resolveImageUrl(image.url);

    return url ? [{ url, alt: image.alt }] : [];
  });

  const discount = discountPercent(product);
  const savings = product.salePrice ? product.price - product.salePrice : 0;
  const relatedProducts = (related?.items ?? [])
    .filter((item) => item.id !== product.id)
    .slice(0, 5);

  const promises = [
    {
      icon: PackageCheck,
      title: "Live stock",
      copy: product.inStock
        ? `${product.stock} available, counted by the inventory ledger`
        : "Back as soon as the store restocks it",
    },
    {
      icon: Banknote,
      title: profile?.codEnabled ? "Cash on delivery" : "Secure checkout",
      copy: profile?.codEnabled
        ? "Pay on arrival where eligible, or online at checkout"
        : "Online payment, verified by the store's gateway",
    },
    {
      icon: RotateCcw,
      title: "Easy returns",
      copy: "Request a return from your account once the order is delivered",
    },
  ];

  return (
    <div className="space-y-12">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1.5 text-[11px] tracking-wide text-bark-500 uppercase"
      >
        <Link href="/" className="hover:text-bark-900">
          Home
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <Link href="/categories" className="hover:text-bark-900">
          Categories
        </Link>
        {product.category ? (
          <>
            <ChevronRight className="h-3 w-3" aria-hidden />
            <Link
              href={`/categories/${product.category.slug}`}
              className="hover:text-bark-900"
            >
              {product.category.name}
            </Link>
          </>
        ) : null}
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span className="truncate font-medium text-bark-800 normal-case">
          {product.name}
        </span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12">
        <ProductGallery images={images} name={product.name} />

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-medium tracking-[0.24em] text-bark-500 uppercase">
              {product.brand ?? product.category?.name ?? "Ecommerce26"}
            </p>
            {discount > 0 ? (
              <span className="rounded-full bg-baby-400 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-bark-950 uppercase">
                {discount}% off
              </span>
            ) : null}
          </div>

          <h1 className="font-display mt-2 text-3xl leading-[1.1] text-bark-950 sm:text-[2.6rem]">
            {product.name}
          </h1>

          {product.ratingCount > 0 ? (
            <Link
              href="#reviews"
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-bark-600 hover:text-bark-900"
            >
              <Star className="h-3.5 w-3.5 fill-baby-600 text-baby-600" aria-hidden />
              <span className="font-semibold text-bark-900">
                {product.ratingAverage.toFixed(1)}
              </span>
              <span className="text-bark-500">
                · {product.ratingCount.toLocaleString("en-IN")}{" "}
                {product.ratingCount === 1 ? "review" : "reviews"}
              </span>
            </Link>
          ) : (
            <p className="mt-3 text-xs text-bark-500">
              No ratings yet — only delivered buyers can review.
            </p>
          )}

          {product.shortDescription ? (
            <p className="mt-4 max-w-prose text-sm leading-relaxed text-bark-600">
              {product.shortDescription}
            </p>
          ) : null}

          {/* The sticky mobile bar watches this block to know when to appear. */}
          <div data-buy-anchor className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-3xl leading-none text-bark-950">
              {formatCurrency(product.effectivePrice)}
            </span>
            {discount > 0 ? (
              <>
                <span className="text-sm text-bark-500 line-through">
                  {formatCurrency(product.price)}
                </span>
                <span className="text-xs font-medium text-baby-700">
                  You save {formatCurrency(savings)}
                </span>
              </>
            ) : null}
          </div>

          <p className="mt-2 flex items-center gap-2 text-xs">
            <span
              className={
                product.inStock
                  ? "h-1.5 w-1.5 rounded-full bg-emerald-600"
                  : "h-1.5 w-1.5 rounded-full bg-rose-500"
              }
              aria-hidden
            />
            <span className={product.inStock ? "text-bark-700" : "font-medium text-rose-700"}>
              {product.inStock
                ? `In stock · ${product.stock} available`
                : "Out of stock right now"}
            </span>
          </p>

          <div className="mt-6 flex items-stretch gap-2">
            <AddToCartButton
              productId={product.id}
              inStock={product.inStock}
              stock={product.stock}
              className="w-full sm:w-full"
            />
            <ShareProduct name={product.name} />
          </div>

          <ul className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-cream-300 bg-cream-300 sm:grid-cols-3">
            {promises.map(({ icon: Icon, title, copy }) => (
              <li key={title} className="bg-cream-50 p-3.5">
                <Icon className="h-4 w-4 text-bark-500" aria-hidden />
                <p className="mt-2 text-[11px] font-semibold tracking-[0.12em] text-bark-900 uppercase">
                  {title}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-bark-500">{copy}</p>
              </li>
            ))}
          </ul>

          <div className="mt-6 border-t border-cream-300 pt-5">
            {/* Preview only: the discount is priced by the API, and checkout re-quotes. */}
            <CouponField lines={[{ productId: product.id, quantity: 1 }]} />
            <Link
              href="/offers"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-bark-800 underline decoration-bark-300 underline-offset-4 hover:decoration-bark-900"
            >
              <Tag className="h-3.5 w-3.5" aria-hidden />
              See all current offers
            </Link>
          </div>
        </div>
      </div>

      <section className="grid gap-8 border-t border-cream-300 pt-10 lg:grid-cols-[1fr_280px] lg:gap-14">
        <div>
          <h2 className="font-display text-2xl text-bark-950">About this product</h2>
          <p className="mt-3 max-w-prose text-sm leading-relaxed whitespace-pre-line text-bark-600">
            {product.description}
          </p>
        </div>

        <dl className="h-fit space-y-2.5 rounded-2xl border border-cream-300 bg-cream-50 p-5 text-xs">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-bark-500">SKU</dt>
            <dd className="font-mono text-bark-800">{product.sku}</dd>
          </div>
          {product.brand ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-bark-500">Brand</dt>
              <dd className="text-bark-800">{product.brand}</dd>
            </div>
          ) : null}
          {product.category ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-bark-500">Category</dt>
              <dd className="text-right">
                <Link
                  href={`/categories/${product.category.slug}`}
                  className="text-bark-800 underline decoration-bark-300 underline-offset-2 hover:decoration-bark-900"
                >
                  {product.category.name}
                </Link>
              </dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-bark-500">Availability</dt>
            <dd className={product.inStock ? "text-bark-800" : "text-rose-700"}>
              {product.inStock ? `${product.stock} in stock` : "Out of stock"}
            </dd>
          </div>
        </dl>
      </section>

      <ProductReviews productSlug={product.slug} />

      <StickyBuyBar
        productId={product.id}
        productName={product.name}
        price={product.effectivePrice}
        inStock={product.inStock}
        stock={product.stock}
      />

      {product.category && relatedProducts.length > 0 ? (
        <ProductRail
          title={`More in ${product.category.name}`}
          description="Same shelf, same live prices"
          href={`/categories/${product.category.slug}`}
          products={relatedProducts}
        />
      ) : null}
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div className="space-y-10">
      <div className="h-3 w-64 animate-pulse rounded bg-cream-300" />
      <div className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12">
        <div className="aspect-[4/5] animate-pulse rounded-[24px] bg-cream-300" />
        <div className="space-y-4">
          <div className="h-3 w-24 animate-pulse rounded bg-cream-300" />
          <div className="h-10 w-3/4 animate-pulse rounded bg-cream-300" />
          <div className="h-4 w-32 animate-pulse rounded bg-cream-300" />
          <div className="h-8 w-40 animate-pulse rounded bg-cream-300" />
          <div className="h-12 w-full animate-pulse rounded-xl bg-cream-300" />
          <div className="h-24 w-full animate-pulse rounded-2xl bg-cream-300" />
        </div>
      </div>
    </div>
  );
}
