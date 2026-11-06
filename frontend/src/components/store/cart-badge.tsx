"use client";

// src/components/store/cart-badge.tsx

/**
 * The cart icon and its count in the storefront header.
 *
 * The count is the server's `itemCount` for the loaded cart — not a local tally —
 * so it matches exactly what the cart page will show. The icon is always visible;
 * only the count disappears at zero.
 */
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/store/cart.store";

export function CartBadge({ className }: { className?: string }) {
  const count = useCartStore((state) => state.itemCount);
  const label = count > 0 ? `Cart, ${count} ${count === 1 ? "item" : "items"}` : "Cart";

  return (
    <Link
      href="/cart"
      aria-label={label}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100",
        className,
      )}
    >
      <ShoppingCart className="h-4.5 w-4.5" aria-hidden />
      {count > 0 ? (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] leading-none font-semibold text-white"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
