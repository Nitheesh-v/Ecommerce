"use client";

// src/components/cart/add-to-cart-button.tsx

/**
 * "Add to cart" for a product page.
 *
 * Signing in is required by the API (the cart is per account), so a signed-out
 * click takes the shopper to the sign-in screen and brings them straight back —
 * the product page is in the `next` parameter, nothing is lost.
 */
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/store/cart.store";
import { useCustomerAuthStore } from "@/store/customer-auth.store";

export function AddToCartButton({
  productId,
  inStock,
  stock,
  className,
}: {
  productId: string;
  inStock: boolean;
  stock: number;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const addItem = useCartStore((state) => state.addItem);
  const authStatus = useCustomerAuthStore((state) => state.status);
  const [adding, setAdding] = useState(false);

  const onClick = async () => {
    if (authStatus === "unauthenticated") {
      router.push(`/login?next=${encodeURIComponent(pathname || "/products")}`);

      return;
    }

    setAdding(true);
    await addItem(productId, 1);
    setAdding(false);
  };

  if (!inStock || stock <= 0) {
    return (
      <button
        type="button"
        disabled
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500 sm:w-auto",
          className,
        )}
      >
        <ShoppingCart className="h-4 w-4" aria-hidden />
        Out of stock
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={adding}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-80 sm:w-auto",
        className,
      )}
    >
      {adding ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <ShoppingCart className="h-4 w-4" aria-hidden />
      )}
      {adding ? "Adding…" : "Add to cart"}
    </button>
  );
}
