import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  Banknote,
  Headphones,
  PackageCheck,
  Search,
  Sparkles,
  Star,
  Tag,
} from "lucide-react";
import { ProductRail } from "@/components/store/product-rail";
import { resolveImageUrl } from "@/lib/images";
import { catalogService } from "@/services/store/catalog.service";

export const metadata: Metadata = {
  title: "Ecommerce26 — shop electronics, audio and more",
  description:
    "Browse live catalogue pricing, real stock and customer ratings. Deals, top-rated picks and new arrivals, all from the store API.",
};

const TRUST = [
  { icon: PackageCheck, label: "Live stock", hint: "Quantities come from the inventory ledger" },
  { icon: BadgePercent, label: "Real prices", hint: "Server-priced, sale prices included" },
  { icon: Star, label: "Verified reviews", hint: "Only delivered buyers can rate" },
];

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
  const highlights = [
    ...(profile?.codEnabled ? ["Cash on delivery"] : []),
    "Free shipping over the store threshold",
    profile?.supportEmail ? `Support: ${profile.supportEmail}` : "Order tracking in your account",
  ];

  const hasCatalogue = deals.length + topRated.length + newArrivals.length + featured.length > 0;

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl bg-slate-900 text-white">
        <div className="grid gap-6 px-6 py-10 sm:px-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium tracking-wide text-slate-200 uppercase">
              <Sparkles className="h-3 w-3" aria-hidden />
              {storeName}
            </p>
            <h1 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything you need, at prices that are actually in stock.
            </h1>
            <p className="mt-2 max-w-lg text-sm text-slate-300">
              Deals, top-rated picks and new arrivals — every price, rating and stock
              count on this page is read live from the store.
            </p>

            <form action="/products" method="get" role="search" className="relative mt-6 max-w-md">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                type="search"
                name="search"
                placeholder="Search the catalogue"
                aria-label="Search the catalogue"
                className="w-full rounded-lg border border-white/10 bg-white/95 py-2.5 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/40"
              />
            </form>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/products"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
              >
                Shop all products
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/offers"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                <Tag className="h-4 w-4" aria-hidden />
                Offers &amp; coupons
              </Link>
            </div>

            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-300">
              {highlights.map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-3 gap-3 lg:justify-items-end">
            {TRUST.map(({ icon: Icon, label, hint }) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs"
              >
                <Icon className="h-4 w-4 text-emerald-400" aria-hidden />
                <p className="mt-2 font-medium text-white">{label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{hint}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Category strip */}
      {categories.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Shop by category</h2>
            <Link href="/categories" className="text-xs font-medium text-slate-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {categories.slice(0, 8).map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.slug}`}
                className="group flex w-24 shrink-0 flex-col items-center gap-2 rounded-lg p-2 text-center transition-colors hover:bg-slate-50"
              >
                <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                  {category.image?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveImageUrl(category.image.url) ?? category.image.url}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Tag className="h-5 w-5 text-slate-400" aria-hidden />
                  )}
                </span>
                <span className="line-clamp-2 text-[11px] font-medium text-slate-700 group-hover:text-slate-900">
                  {category.name}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {!hasCatalogue ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <Headphones className="mx-auto h-6 w-6 text-slate-300" aria-hidden />
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            Nothing is published yet
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Publish a product in the admin console and it appears here immediately —
            there is no placeholder catalogue.
          </p>
          <Link
            href="/admin/products"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 underline underline-offset-2"
          >
            Go to products
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>
      ) : (
        <>
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

      {/* Payment / support band, from the real settings document */}
      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-3">
        <div className="flex items-start gap-3">
          <Banknote className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden />
          <div>
            <p className="text-sm font-medium text-slate-900">Payment options</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {profile
                ? profile.codEnabled
                  ? "Cash on delivery and online payment, decided at checkout."
                  : "Online payment at checkout (cash on delivery is currently off)."
                : "Payment method is chosen at checkout."}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <PackageCheck className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden />
          <div>
            <p className="text-sm font-medium text-slate-900">Delivery &amp; tracking</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Every order has a timeline you can follow from your account.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Headphones className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden />
          <div>
            <p className="text-sm font-medium text-slate-900">Support</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {profile?.supportPhone ?? "Contact details are published by the store."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
