import Link from "next/link";
import { Suspense } from "react";
import { Search, ShoppingBag, Store, Tag, LayoutGrid } from "lucide-react";
import { AccountMenu } from "./account/account-menu";

/**
 * Storefront chrome.
 *
 * The search field is a plain GET form pointed at `/products`: it works without
 * JavaScript, keeps the query in the URL (shareable, back-button friendly) and the
 * browse page can therefore be rendered on the server.
 */
export function StoreHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Store className="h-4 w-4" aria-hidden />
          </span>
          <span className="hidden text-sm font-semibold tracking-tight text-slate-900 sm:inline">
            Ecommerce26
          </span>
        </Link>

        <form action="/products" method="get" role="search" className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            name="search"
            placeholder="Search for products, brands and more"
            aria-label="Search products"
            className="w-full rounded-lg border border-transparent bg-slate-100 py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-500 transition-colors focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </form>

        <nav className="flex shrink-0 items-center gap-0.5 text-sm">
          <Link
            href="/products"
            className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-slate-700 transition-colors hover:bg-slate-100 md:inline-flex"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden />
            Shop
          </Link>
          <Link
            href="/categories"
            className="hidden rounded-lg px-3 py-2 text-slate-700 transition-colors hover:bg-slate-100 lg:inline-flex"
          >
            Categories
          </Link>
          <Link
            href="/offers"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Tag className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Offers</span>
          </Link>
          {/*
            The account control reads `usePathname`/`useRouter` (both dynamic), so it
            is deferred: the rest of the header stays part of the static shell and this
            subtree renders at request time.
          */}
          <Suspense
            fallback={<div className="h-9 w-24 animate-pulse rounded-lg bg-slate-100" aria-hidden />}
          >
            <AccountMenu />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}

export function StoreFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-3">
        <div>
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <ShoppingBag className="h-4 w-4" aria-hidden />
            Ecommerce26
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Products, prices and stock on this site come straight from the store API —
            no placeholder data anywhere.
          </p>
        </div>

        <div className="space-y-2 text-xs">
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            Shop
          </p>
          <Link href="/products" className="block text-slate-600 hover:text-slate-900">
            All products
          </Link>
          <Link href="/categories" className="block text-slate-600 hover:text-slate-900">
            Categories
          </Link>
          <Link href="/offers" className="block text-slate-600 hover:text-slate-900">
            Offers &amp; coupons
          </Link>
        </div>

        <div className="space-y-2 text-xs">
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            Account
          </p>
          <Link href="/account" className="block text-slate-600 hover:text-slate-900">
            My account
          </Link>
          <Link href="/account/orders" className="block text-slate-600 hover:text-slate-900">
            My orders
          </Link>
          <Link href="/login" className="block text-slate-600 hover:text-slate-900">
            Sign in
          </Link>
        </div>
      </div>

      <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">
        © Ecommerce26 — every price and stock count is served by the store API
      </div>
    </footer>
  );
}
