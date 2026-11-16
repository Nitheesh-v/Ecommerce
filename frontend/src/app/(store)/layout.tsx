import type { ReactNode } from "react";
import { Toaster } from "@/components/admin/ui/toaster";
import { StoreFooter, StoreHeader } from "@/components/store/store-header";

/**
 * Storefront shell.
 *
 * Categories and products are rendered on the server (SEO + no client fetch
 * waterfall); the header links back to the admin console for the store owner.
 * `Toaster` is mounted once here — the cart and the checkout report rejected
 * quantity changes, coupon removals and copied order numbers through it.
 */
export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-cream-100">
      {/* Keyboard users should reach the content without tabbing the whole header. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-cream-50 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-bark-950 focus:shadow-lg"
      >
        Skip to content
      </a>
      <StoreHeader />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 focus:outline-none"
      >
        {children}
      </main>
      <StoreFooter />
      <Toaster />
    </div>
  );
}
