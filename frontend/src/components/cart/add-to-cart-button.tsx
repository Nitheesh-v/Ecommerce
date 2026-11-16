"use client";

// src/components/cart/add-to-cart-button.tsx

/**
 * "Add to cart" for a product page.
 *
 * Works signed out: the cart is keyed to the guest id this browser holds, so the
 * shopper never leaves the product page to create an account. If they sign in
 * later, the basket merges into the account instead of being lost.
 */
import { useState } from "react";
import { Loader2, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/store/cart.store";

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
  const addItem = useCartStore((state) => state.addItem);
  const [adding, setAdding] = useState(false);

  const onClick = async () => {
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
          "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cream-300 px-4 py-2.5 text-sm font-semibold text-bark-500 sm:w-auto",
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
        "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-baby-400 px-4 py-2.5 text-sm font-semibold text-bark-950 transition-colors hover:bg-baby-300 disabled:opacity-80 sm:w-auto",
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
