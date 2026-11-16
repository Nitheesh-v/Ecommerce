// src/app/(store)/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgePercent,
  Banknote,
  Headphones,
  PackageCheck,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import { ProductRail } from "@/components/store/product-rail";
import { CategoryCard } from "@/components/store/category-card";
import { discountPercent } from "@/components/store/product-card";
import { resolveImageUrl } from "@/lib/images";
import { formatCurrency } from "@/lib/utils";
import { catalogService } from "@/services/store/catalog.service";
import type { PublicProduct } from "@/types/storefront";

export const metadata: Metadata = {
  title: "Ecommerce26 — a small catalogue, honestly priced",
  description:
    "Deals, top-rated picks and new arrivals with live stock and real prices. Every number on this page is read from the store API.",
};

/**
 * The one image-and-price panel in the hero.
 *
 * It is the highest-value thing on the page, so it uses the first featured product,
 * falls back through the other rails, and finally to a typographic panel — a missing
 * image or an unreachable API must not leave a hole above the fold.
 */
function HeroSpotlight({ product }: { product: PublicProduct | null }) {
  if (!product) {
    return (
      <div className="animate-rise relative flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-[28px] border border-cream-300 bg-cream-200 p-8 sm:aspect-[5/4] lg:aspect-[4/5]">
        <span className="text-[10px] font-medium tracking-[0.24em] text-bark-600 uppercase">
          The collection
        </span>
        <p className="font-display text-4xl leading-[1.05] text-bark-900">
          New season,
          <br />
          same honest
          <br />
          prices.
        </p>
        <p className="max-w-[22ch] text-xs leading-relaxed text-bark-600">
          Publish a product in the console and it takes this spot — there is no
          placeholder catalogue.
        </p>
      </div>
    );
  }

  const image = resolveImageUrl(
    product.images.find((item) => item.isPrimary)?.url ?? product.images[0]?.url,
  );
  const discount = discountPercent(product);

  return (
    <Link
      href={`/products/${product.slug}`}
      className="animate-rise group relative block overflow-hidden rounded-[28px] border border-cream-300 bg-cream-200"
    >
      <div className="relative aspect-[4/5] w-full sm:aspect-[5/4] lg:aspect-[4/5]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Sparkles className="h-10 w-10 text-bark-300" aria-hidden />
          </div>
        )}

        <span className="absolute top-4 left-4 rounded-full bg-baby-400 px-3 py-1 text-[10px] font-semibold tracking-[0.18em] text-bark-950 uppercase">
          {discount > 0 ? `${discount}% off` : "Featured"}
        </span>

        <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-cream-300/70 bg-cream-50/92 p-4 backdrop-blur-md">
          <p className="text-[10px] tracking-[0.2em] text-bark-500 uppercase">
            {product.brand ?? product.category?.name ?? "Ecommerce26"}
          </p>
          <p className="font-display mt-1 line-clamp-2 text-lg leading-snug text-bark-950">
            {product.name}
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-bark-950">
                {formatCurrency(product.effectivePrice)}
              </span>
              {discount > 0 ? (
                <span className="text-xs text-bark-500 line-through">
                  {formatCurrency(product.price)}
                </span>
              ) : null}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium tracking-[0.14em] text-bark-700 uppercase transition-all group-hover:gap-2">
              View
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/** A thin drifting band of true statements. Decorative, so it is hidden from readers. */
function MarqueeBand({ items }: { items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  const line = [...items, ...items, ...items, ...items];

  return (
    <div className="overflow-hidden border-b border-cream-300 bg-cream-200 py-2" aria-hidden>
      <div className="animate-drift flex w-max items-center gap-8 whitespace-nowrap">
        {line.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="flex items-center gap-8 text-[10px] font-medium tracking-[0.24em] text-bark-600 uppercase"
          >
            {item}
            <span className="h-1 w-1 rounded-full bg-baby-600" />
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function StoreHomePage() {
  const [categories, deals, topRated, newArrivals, featured, profile] = await Promise.all([
    catalogService.categoryTree(),
    catalogService.deals(5),
    catalogService.topRated(5),
    catalogService.newArrivals(5),
    catalogService.featuredProducts(5),
    catalogService.storeProfile(),
  ]);

  const storeName = profile?.storeName ?? "Ecommerce26";
  const spotlight = featured[0] ?? deals[0] ?? topRated[0] ?? newArrivals[0] ?? null;
  const hasCatalogue =
    deals.length + topRated.length + newArrivals.length + featured.length > 0;
  const bestDiscount = deals.reduce(
    (best, product) => Math.max(best, discountPercent(product)),
    0,
  );
  const topCategories = categories.slice(0, 4);

  const assurances = [
    {
      icon: PackageCheck,
      label: "Live stock",
      copy: "Every quantity is the inventory ledger's own count, decremented as orders are placed.",
    },
    {
      icon: BadgePercent,
      label: "Server-priced",
      copy: "Prices, tax and shipping are totalled by the API — the browser never does arithmetic.",
    },
    {
      icon: Star,
      label: "Verified reviews",
      copy: "Only a buyer whose order was delivered can leave a rating, so the stars mean something.",
    },
    {
      icon: Banknote,
      label: profile?.codEnabled ? "Cash on delivery" : "Secure checkout",
      copy: profile?.codEnabled
        ? "Pay on arrival where eligible, or online at checkout — decided by the store."
        : "Online payment at checkout, with a timeline you can follow from your account.",
    },
  ];

  const marquee = [
    profile?.codEnabled ? "Cash on delivery" : "Secure online payment",
    "Verified buyer reviews",
    "Live stock from the ledger",
    "Prices set by the store",
  ];

  return (
    <div className="-mt-8 space-y-14">
      <MarqueeBand items={marquee} />

      {/* Hero */}
      <section className="grid items-center gap-8 pt-10 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14">
        <div className="animate-rise">
          <p className="inline-flex items-center gap-2 rounded-full border border-cream-300 bg-cream-100 px-3 py-1.5 text-[10px] font-medium tracking-[0.2em] text-bark-700 uppercase">
            <Sparkles className="h-3 w-3 text-baby-600" aria-hidden />
            {storeName} · The new season
          </p>

          <h1 className="font-display mt-5 text-[2.6rem] leading-[1.02] tracking-tight text-bark-950 sm:text-5xl lg:text-[4.1rem]">
            Beautiful things,
            <br />
            <em className="text-bark-700 italic">honestly</em> priced.
          </h1>

          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-bark-600">
            A small, carefully chosen catalogue. Every price, rating and stock count on
            this page is read live from the store — nothing here is decorative.
          </p>

          <form action="/products" method="get" role="search" className="relative mt-7 max-w-md">
            <Search
              className="pointer-events-none absolute top-1/2 left-5 h-4 w-4 -translate-y-1/2 text-bark-400"
              aria-hidden
            />
            <input
              type="search"
              name="search"
              placeholder="Search the catalogue"
              aria-label="Search the catalogue"
              className="w-full rounded-full border border-cream-300 bg-cream-100 py-3.5 pr-4 pl-12 text-sm text-bark-900 placeholder:text-bark-500 transition-colors focus:border-bark-300 focus:bg-cream-50 focus:outline-none focus:ring-2 focus:ring-baby-300"
            />
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/products"
              className="group inline-flex items-center gap-2 rounded-full bg-baby-400 px-6 py-3 text-sm font-semibold text-bark-950 transition-colors hover:bg-baby-300"
            >
              Shop the collection
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
            <Link
              href="/offers"
              className="inline-flex items-center gap-2 rounded-full border border-bark-300 px-6 py-3 text-sm font-medium text-bark-900 transition-colors hover:border-bark-900 hover:bg-cream-100"
            >
              Offers &amp; coupons
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[10px] font-medium tracking-[0.18em] text-bark-500 uppercase">
            <li>{profile?.codEnabled ? "Cash on delivery" : "Secure online checkout"}</li>
            <li className="hidden sm:block">Free shipping over the threshold</li>
            <li>{profile?.supportEmail ? profile.supportEmail : "Support from your account"}</li>
          </ul>
        </div>

        <HeroSpotlight product={spotlight} />
      </section>

      {/* Four promises, as a hairline-divided strip */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-cream-300 bg-cream-300 sm:grid-cols-4">
        {assurances.map(({ icon: Icon, label, copy }) => (
          <div key={label} className="bg-cream-50 p-4 sm:p-5">
            <Icon className="h-4 w-4 text-bark-500" aria-hidden />
            <p className="mt-3 text-[11px] font-semibold tracking-[0.16em] text-bark-900 uppercase">
              {label}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-bark-500">{copy}</p>
          </div>
        ))}
      </section>

      {/* Categories */}
      {topCategories.length > 0 ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-cream-300 pb-3">
            <div>
              <h2 className="font-display text-2xl leading-none text-bark-900 sm:text-[28px]">
                Shop by category
              </h2>
              <p className="mt-1.5 text-xs text-bark-500">
                {categories.length} categor{categories.length === 1 ? "y" : "ies"} in the catalogue
              </p>
            </div>
            <Link
              href="/categories"
              className="group inline-flex items-center gap-1 text-xs font-medium tracking-wide text-bark-700 uppercase hover:text-bark-950"
            >
              All categories
              <ArrowUpRight
                className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {topCategories.map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        </section>
      ) : null}

      {!hasCatalogue ? (
        <section className="rounded-[28px] border border-dashed border-cream-400 bg-cream-50 px-6 py-20 text-center">
          <Headphones className="mx-auto h-6 w-6 text-bark-400" aria-hidden />
          <h2 className="font-display mt-4 text-xl text-bark-900">Nothing is published yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-bark-500">
            Publish a product in the admin console and it appears here immediately —
            there is no placeholder catalogue.
          </p>
          <Link
            href="/admin/products"
            className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-baby-400 px-5 py-2.5 text-sm font-semibold text-bark-950 transition-colors hover:bg-baby-300"
          >
            Go to products
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>
      ) : (
        <>
          {/* The one dark panel: sale, with three real products beside it */}
          {deals.length > 0 ? (
            <section className="overflow-hidden rounded-[28px] bg-bark-900 px-6 py-10 text-cream-100 sm:px-10">
              <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                <div>
                  <p className="text-[10px] font-medium tracking-[0.24em] text-cream-400 uppercase">
                    The mid-season edit
                  </p>
                  <h2 className="font-display mt-3 text-3xl leading-[1.08] sm:text-[2.6rem]">
                    {bestDiscount > 0
                      ? `Up to ${bestDiscount}% off — decided by the store.`
                      : "Sale prices, straight from the store."}
                  </h2>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-cream-300/85">
                    Sale prices are applied by the API, so the number you see here is the
                    number checkout will charge.
                  </p>
                  <Link
                    href="/products?onSale=true&sortBy=price&sortOrder=asc"
                    className="group mt-6 inline-flex items-center gap-2 rounded-full bg-baby-400 px-6 py-3 text-sm font-medium text-bark-950 transition-colors hover:bg-baby-300"
                  >
                    Shop the sale
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {deals.slice(0, 3).map((product) => {
                    const image = resolveImageUrl(
                      product.images.find((item) => item.isPrimary)?.url ??
                        product.images[0]?.url,
                    );

                    return (
                      <Link
                        key={product.id}
                        href={`/products/${product.slug}`}
                        className="group overflow-hidden rounded-2xl bg-cream-50 p-2 text-bark-900 transition-transform hover:-translate-y-0.5"
                      >
                        <span className="block aspect-square overflow-hidden rounded-xl bg-cream-200">
                          {image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={image}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : null}
                        </span>
                        <span className="mt-2 block truncate text-[11px] font-medium">
                          {product.name}
                        </span>
                        <span className="block text-[11px] text-bark-600">
                          {formatCurrency(product.effectivePrice)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}

          <ProductRail
            title="Deals of the day"
            description="Sale prices below the list price, cheapest first"
            href="/products?onSale=true&sortBy=price&sortOrder=asc"
            products={deals}
          />

          <ProductRail
            title="Top rated"
            description="Ranked by verified buyer ratings"
            href="/products?sortBy=rating&sortOrder=desc"
            products={topRated}
          />

          <ProductRail
            title="New arrivals"
            description="Freshly published in the catalogue"
            href="/products?sortBy=createdAt&sortOrder=desc"
            products={newArrivals}
          />

          {featured.length > 0 ? (
            <ProductRail
              title="Handpicked"
              description="Flagged as featured by the store"
              href="/products?featured=true"
              products={featured}
            />
          ) : null}
        </>
      )}

      {/* How the store works — the promises again, with the reasoning */}
      <section className="grid gap-8 rounded-[28px] border border-cream-300 bg-cream-100 p-6 sm:p-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
        <div>
          <p className="text-[10px] font-medium tracking-[0.24em] text-bark-500 uppercase">
            Why shop here
          </p>
          <h2 className="font-display mt-3 text-3xl leading-[1.1] text-bark-950">
            A store that shows its working.
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-bark-600">
            No invented urgency, no crossed-out prices that were never charged. The
            catalogue, the ledger and the checkout all read the same numbers.
          </p>
          <Link
            href="/products"
            className="group mt-6 inline-flex items-center gap-2 text-sm font-medium text-bark-900 underline decoration-bark-300 decoration-1 underline-offset-4 transition-colors hover:decoration-bark-900"
          >
            Browse everything
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </div>

        <ol className="space-y-5">
          {assurances.slice(0, 3).map(({ label, copy }, index) => (
            <li key={label} className="flex gap-4 border-b border-cream-300 pb-5 last:border-0 last:pb-0">
              <span className="font-display text-sm text-bark-400">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-sm font-medium text-bark-950">{label}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-bark-600">{copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Support, from the real settings document */}
      <section className="flex flex-col gap-5 rounded-[28px] border border-cream-300 bg-cream-200/70 px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <div>
          <p className="text-[10px] font-medium tracking-[0.24em] text-bark-600 uppercase">
            Need a hand?
          </p>
          <h2 className="font-display mt-2 text-2xl text-bark-950">
            {profile?.supportPhone ?? "We answer from your account"}
          </h2>
          <p className="mt-1.5 text-sm text-bark-600">
            {profile?.supportEmail ?? "Order updates, returns and invoices live in your account."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Link
            href="/account/orders"
            className="inline-flex items-center gap-2 rounded-full bg-baby-400 px-5 py-2.5 text-sm font-semibold text-bark-950 transition-colors hover:bg-baby-300"
          >
            Track an order
          </Link>
          <Link
            href="/offers"
            className="inline-flex items-center gap-2 rounded-full border border-bark-300 px-5 py-2.5 text-sm font-medium text-bark-900 transition-colors hover:bg-cream-100"
          >
            <Banknote className="h-4 w-4" aria-hidden />
            Offers
          </Link>
        </div>
      </section>
    </div>
  );
}
