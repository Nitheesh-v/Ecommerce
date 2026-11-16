// src/components/store/store-header.tsx

import Link from "next/link";
import { Suspense } from "react";
import { Search, ShoppingBag, Store } from "lucide-react";
import { AccountMenu } from "./account/account-menu";
import { CartBadge } from "./cart-badge";
import { NotificationBell } from "./notification-bell";
import { StoreNavLinks } from "./store-nav-links";

/**
 * Storefront chrome.
 *
 * The search field is a plain GET form pointed at `/products`: it works without
 * JavaScript, keeps the query in the URL (shareable, back-button friendly) and the
 * browse page can therefore be rendered on the server.
 */
export function StoreHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-bark-800 bg-bark-900/95 text-cream-100 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cream-50 text-bark-900">
            <Store className="h-4 w-4" aria-hidden />
          </span>
          <span className="font-display hidden text-lg leading-none tracking-tight text-cream-50 sm:inline">
            Ecommerce26
          </span>
        </Link>

        <form action="/products" method="get" role="search" className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-bark-500"
            aria-hidden
          />
          <input
            type="search"
            name="search"
            placeholder="Search for products, brands and more"
            aria-label="Search products"
            className="w-full rounded-full border border-transparent bg-cream-50 py-2.5 pr-4 pl-10 text-sm text-bark-900 placeholder:text-bark-500 transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-baby-300"
          />
        </form>

        <nav className="flex shrink-0 items-center gap-0.5 text-sm">
          <Suspense
            fallback={
              <>
                <span className="hidden h-9 w-20 animate-pulse rounded-full bg-bark-800 md:block" />
                <span className="hidden h-9 w-24 animate-pulse rounded-full bg-bark-800 lg:block" />
                <span className="h-9 w-20 animate-pulse rounded-full bg-bark-800" />
              </>
            }
          >
            <StoreNavLinks />
          </Suspense>

          {/* Reads the cart store, which only exists in the browser. */}
          <Suspense
            fallback={
              <span className="h-9 w-9 animate-pulse rounded-full bg-bark-800" aria-hidden />
            }
          >
            <CartBadge />
          </Suspense>

          {/* Only renders for a signed-in shopper; reads the unread count. */}
          <Suspense fallback={null}>
            <NotificationBell />
          </Suspense>
          {/*
            The account control reads `usePathname`/`useRouter` (both dynamic), so it
            is deferred: the rest of the header stays part of the static shell and this
            subtree renders at request time.
          */}
          <Suspense
            fallback={
              <div className="h-9 w-24 animate-pulse rounded-full bg-bark-800" aria-hidden />
            }
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
    <footer className="mt-20 bg-bark-900 text-cream-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cream-100 text-bark-900">
                <ShoppingBag className="h-4 w-4" aria-hidden />
              </span>
              <span className="font-display text-xl leading-none">Ecommerce26</span>
            </p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-cream-300/80">
              Products, prices and stock on this site come straight from the store API —
              no placeholder data anywhere.
            </p>
            <p className="mt-6 text-[11px] tracking-[0.2em] text-cream-400/70 uppercase">
              Made in India · Prices in INR
            </p>
          </div>

          <div className="space-y-2.5 text-sm">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-cream-400 uppercase">
              Shop
            </p>
            <Link href="/products" className="block text-cream-200 transition-colors hover:text-cream-50">
              All products
            </Link>
            <Link href="/categories" className="block text-cream-200 transition-colors hover:text-cream-50">
              Categories
            </Link>
            <Link href="/offers" className="block text-cream-200 transition-colors hover:text-cream-50">
              Offers &amp; coupons
            </Link>
          </div>

          <div className="space-y-2.5 text-sm">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-cream-400 uppercase">
              Account
            </p>
            <Link href="/account" className="block text-cream-200 transition-colors hover:text-cream-50">
              My account
            </Link>
            <Link
              href="/account/orders"
              className="block text-cream-200 transition-colors hover:text-cream-50"
            >
              My orders
            </Link>
            <Link href="/login" className="block text-cream-200 transition-colors hover:text-cream-50">
              Sign in
            </Link>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-cream-100/15 pt-6 text-xs text-cream-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© Ecommerce26 — every price and stock count is served by the store API</p>
          <p className="tracking-[0.16em] uppercase">Cash on delivery · Secure checkout</p>
        </div>
      </div>
    </footer>
  );
}
