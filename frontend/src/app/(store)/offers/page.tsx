import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Tag, Ticket } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { offersStorefront } from "@/services/store/offers.service";

export const metadata: Metadata = {
  title: "Offers & coupons",
  description: "Current coupon codes, discounts, minimum spends and expiry dates.",
};

/**
 * Customer offers page.
 *
 * Everything shown here comes from the public projection: codes, discount labels,
 * minimum spend, expiry and which products or categories qualify. Lifetime counts,
 * per-customer limits and the internal on/off switch never leave the admin API.
 */
export default async function OffersPage() {
  const offers = await offersStorefront.active();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-bark-900">
          Offers &amp; coupons
        </h1>
        <p className="text-sm text-bark-700">
          Apply a code at checkout. One coupon per order — we always show the final price
          before you pay.
        </p>
      </header>

      {offers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-cream-300 px-6 py-12 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-cream-200 text-bark-400">
            <Ticket className="h-5 w-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-medium text-bark-800">No offers right now</p>
          <p className="mt-1 text-xs text-bark-500">
            New coupons appear here as soon as they go live.
          </p>
          <Link
            href="/categories"
            className="mt-4 inline-block text-sm font-medium text-bark-900 hover:text-bark-950"
          >
            Browse the catalogue
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {offers.map((offer) => (
            <li
              key={offer.id}
              className="flex flex-col gap-3 rounded-2xl border border-cream-300 bg-cream-50 p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-1.5 rounded-full bg-baby-50 px-2 py-0.5 text-xs font-semibold text-bark-950">
                    <Tag className="h-3 w-3" aria-hidden />
                    {offer.valueLabel}
                  </p>
                  <h2 className="mt-2 text-base font-semibold text-bark-900">
                    {offer.name}
                  </h2>
                  {offer.description ? (
                    <p className="mt-1 text-sm text-bark-700">{offer.description}</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-lg border border-dashed border-cream-400 bg-cream-100 px-3 py-2">
                <p className="text-[11px] font-medium tracking-wide text-bark-500 uppercase">
                  Coupon code
                </p>
                <code className="font-mono text-lg font-semibold tracking-widest text-bark-900">
                  {offer.code}
                </code>
              </div>

              <dl className="grid gap-1 text-xs text-bark-700">
                {offer.minCartLabel ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt>Minimum purchase</dt>
                    <dd className="font-medium text-bark-900">{offer.minCartLabel}</dd>
                  </div>
                ) : null}
                {offer.maxDiscount !== null ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt>Maximum discount</dt>
                    <dd className="font-medium text-bark-900">
                      {formatCurrency(offer.maxDiscount)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <dt className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3 w-3 text-bark-400" aria-hidden />
                    Valid until
                  </dt>
                  <dd className="font-medium text-bark-900">{formatDate(offer.endsAt)}</dd>
                </div>
              </dl>

              {offer.applicableCategories.length > 0 || offer.applicableProducts.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {offer.applicableCategories.map((category) => (
                    <span
                      key={category.id}
                      className="rounded-full bg-cream-200 px-2 py-0.5 text-xs text-bark-700"
                    >
                      {category.name}
                    </span>
                  ))}
                  {offer.applicableProducts.map((product) => (
                    <span
                      key={product.id}
                      className="rounded-full bg-cream-200 px-2 py-0.5 text-xs text-bark-700"
                    >
                      {product.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-bark-500">Applies storewide.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
