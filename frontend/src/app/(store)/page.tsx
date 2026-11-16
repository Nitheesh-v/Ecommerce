import Image from "next/image";
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
import { CategoryShowcase } from "@/components/store/home/category-showcase";
import { Faq } from "@/components/store/home/faq";
import { HeroCollage } from "@/components/store/home/hero-collage";
import { Lookbook } from "@/components/store/home/lookbook";
import { StatsBand } from "@/components/store/home/stats-band";
import { ProductRail } from "@/components/store/product-rail";
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

/** Order-preserving dedupe: the same product can lead two rails. */
function uniqueProducts(...lists: PublicProduct[][]): PublicProduct[] {
  const seen = new Set<string>();

  return lists.flat().filter((product) => {
    if (seen.has(product.id)) {
      return false;
    }

    seen.add(product.id);

    return true;
  });
}

/** A thin drifting band of true statements. Decorative, so it is hidden from readers. */
function MarqueeBand({ items }: { items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  const line = [...items, ...items, ...items, ...items];

  return (
    <div className="overflow-hidden border-y border-cream-300 bg-cream-200 py-2.5" aria-hidden>
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
  const [categories, deals, topRated, newArrivals, featured, profile, facets] =
    await Promise.all([
      catalogService.categoryTree(),
      catalogService.deals(5),
      catalogService.topRated(5),
      catalogService.newArrivals(5),
      catalogService.featuredProducts(5),
      catalogService.storeProfile(),
      catalogService.facets(),
    ]);

  const storeName = profile?.storeName ?? "Ecommerce26";
  const everything = uniqueProducts(featured, deals, topRated, newArrivals);
  const hasCatalogue = everything.length > 0;
  const bestDiscount = deals.reduce(
    (best, product) => Math.max(best, discountPercent(product)),
    0,
  );

  const brands = [
    ...new Set(everything.map((product) => product.brand).filter((brand): brand is string => Boolean(brand))),
  ];

  const marquee = [
    profile?.codEnabled ? "Cash on delivery" : "Secure online payment",
    "Verified buyer reviews",
    "Live stock from the ledger",
    "Server-computed totals",
    ...brands.slice(0, 4),
  ];

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

  return (
    <div className="-mt-8 space-y-14 sm:space-y-20">
      {/* Hero */}
      <section className="grid items-center gap-10 pt-10 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:pt-14">
        <div className="animate-rise">
          <p className="inline-flex items-center gap-2 rounded-full border border-cream-300 bg-cream-100 px-3 py-1.5 text-[10px] font-medium tracking-[0.2em] text-bark-700 uppercase">
            <Sparkles className="h-3 w-3 text-baby-600" aria-hidden />
            {storeName} · The new season
          </p>

          <h1 className="font-display mt-5 text-[2.7rem] leading-[1.02] tracking-tight text-bark-950 sm:text-6xl lg:text-[4.3rem]">
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
              className="pointer-events-none absolute top-1/2 left-5 h-4 w-4 -translate-y-1/2 text-bark-500"
              aria-hidden
            />
            <input
              type="search"
              name="search"
              placeholder="Search the catalogue"
              aria-label="Search the catalogue"
              className="w-full rounded-full border border-cream-300 bg-cream-50 py-3.5 pr-4 pl-12 text-sm text-bark-900 shadow-sm shadow-bark-900/5 transition-shadow placeholder:text-bark-500 focus:outline-none focus:ring-2 focus:ring-baby-300"
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

          <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-cream-300 pt-5">
            {facets ? (
              [
                { value: facets.total, label: "Products" },
                { value: facets.categories.length, label: "Categories" },
                { value: facets.inStock, label: "In stock" },
              ].map(({ value, label }) => (
                <div key={label}>
                  <p className="font-display text-xl leading-none text-bark-950 tabular-nums">
                    {value.toLocaleString("en-IN")}
                  </p>
                  <p className="mt-1 text-[10px] tracking-[0.18em] text-bark-500 uppercase">
                    {label}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-[10px] tracking-[0.18em] text-bark-500 uppercase">
                {profile?.codEnabled ? "Cash on delivery" : "Secure online checkout"} ·{" "}
                {profile?.supportEmail ?? "Support from your account"}
              </p>
            )}
          </div>
        </div>

        <HeroCollage products={everything.slice(0, 3)} />
      </section>

      <MarqueeBand items={marquee} />

      {/* Four promises, as a hairline-divided strip */}
      <section className="reveal grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-cream-300 bg-cream-300 sm:grid-cols-4">
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

      <CategoryShowcase categories={categories} total={categories.length} />

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
            <section className="reveal relative overflow-hidden rounded-[28px] bg-bark-900 px-6 py-10 text-cream-100 sm:px-10">
              <div
                aria-hidden
                className="animate-hue pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-baby-400/20 blur-3xl"
              />

              <div className="relative grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                <div>
                  <p className="text-[10px] font-medium tracking-[0.24em] text-cream-400 uppercase">
                    The mid-season edit
                  </p>
                  <h2 className="font-display mt-3 text-3xl leading-[1.08] sm:text-[2.7rem]">
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
                    className="group mt-6 inline-flex items-center gap-2 rounded-full bg-baby-400 px-6 py-3 text-sm font-semibold text-bark-950 transition-colors hover:bg-baby-300"
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
                        <span className="relative block aspect-square overflow-hidden rounded-xl bg-cream-200">
                          {image ? (
                            <Image
                              src={image}
                              alt=""
                              fill
                              sizes="96px"
                              className="object-cover transition-transform duration-500 group-hover:scale-105"
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

          <Lookbook products={everything} />

          <ProductRail
            title="Top rated"
            description="Ranked by verified buyer ratings"
            href="/products?sortBy=rating&sortOrder=desc"
            products={topRated}
          />

          <StatsBand facets={facets} />

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

      <Faq codEnabled={profile?.codEnabled ?? false} supportEmail={profile?.supportEmail} />

      {/* Support, from the real settings document */}
      <section className="reveal flex flex-col gap-5 rounded-[28px] border border-cream-300 bg-cream-200/70 px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10">
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
            href="/products"
            className="group inline-flex items-center gap-2 rounded-full border border-bark-300 px-5 py-2.5 text-sm font-medium text-bark-900 transition-colors hover:bg-cream-50"
          >
            Keep browsing
            <ArrowUpRight
              className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </div>
      </section>
    </div>
  );
}
