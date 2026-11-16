// src/app/not-found.tsx

/**
 * Site-wide 404.
 *
 * Reached by an unknown product slug, a deleted category, or a mistyped URL. It
 * offers a working search form (the same plain GET form the header uses, so it
 * works without JavaScript) rather than only a link home: the common reason to
 * land here is a product that no longer exists, and the shopper still wants to
 * find something to buy.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Search } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-cream-200 text-bark-500">
        <Compass className="h-6 w-6" aria-hidden />
      </span>

      <p className="mt-6 text-[11px] font-semibold tracking-[0.24em] text-bark-500 uppercase">
        404
      </p>
      <h1 className="font-display mt-2 text-3xl text-bark-950">
        We can&rsquo;t find that page
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-bark-600">
        The product may have sold its last piece and been archived, or the link may
        have a typo. Searching is usually faster than going back.
      </p>

      <form
        action="/products"
        method="get"
        role="search"
        className="mt-6 flex w-full max-w-sm items-center gap-2"
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-bark-500"
            aria-hidden
          />
          <input
            type="search"
            name="search"
            placeholder="Search products"
            aria-label="Search products"
            className="w-full rounded-lg border border-cream-300 bg-cream-50 py-2.5 pr-3 pl-10 text-sm text-bark-900 placeholder:text-bark-500 focus:ring-2 focus:ring-baby-300 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-baby-400 px-4 py-2.5 text-sm font-semibold text-bark-950 transition-colors hover:bg-baby-300"
        >
          Search
        </button>
      </form>

      <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-medium text-bark-700">
        <Link href="/" className="underline decoration-bark-300 underline-offset-4 hover:decoration-bark-900">
          Home
        </Link>
        <Link href="/products" className="underline decoration-bark-300 underline-offset-4 hover:decoration-bark-900">
          All products
        </Link>
        <Link href="/categories" className="underline decoration-bark-300 underline-offset-4 hover:decoration-bark-900">
          Categories
        </Link>
        <Link href="/offers" className="underline decoration-bark-300 underline-offset-4 hover:decoration-bark-900">
          Offers
        </Link>
      </div>
    </div>
  );
}
