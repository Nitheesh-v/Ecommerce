import Link from "next/link";
import { Store } from "lucide-react";

/** Minimal storefront chrome — brand, primary navigation, admin shortcut. */
export function StoreHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Store className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-tight text-slate-900">
            Ecommerce26
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/categories"
            className="rounded-lg px-3 py-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            Categories
          </Link>
          <Link
            href="/offers"
            className="rounded-lg px-3 py-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            Offers
          </Link>
          <Link
            href="/admin"
            className="rounded-lg px-3 py-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function StoreFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-8 text-xs text-slate-500 sm:px-6">
        <p className="font-medium text-slate-700">Ecommerce26</p>
        <p>
          Categories and products on this page come straight from the store API —
          no placeholder data.
        </p>
      </div>
    </footer>
  );
}
