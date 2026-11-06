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
    <div className="flex min-h-screen flex-col bg-slate-50">
      <StoreHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <StoreFooter />
      <Toaster />
    </div>
  );
}
