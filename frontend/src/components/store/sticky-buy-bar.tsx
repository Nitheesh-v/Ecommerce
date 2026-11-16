"use client";

// src/components/store/sticky-buy-bar.tsx

/**
 * Mobile buy bar.
 *
 * On a phone the product gallery fills the first screen, which pushes the price
 * and the only "Add to cart" button below the fold — so a shopper who has decided
 * must scroll to act. This bar keeps the decision within thumb reach, and only
 * appears once the real buy area has scrolled away, so the page is never shown
 * two identical buttons at the same time.
 *
 * Desktop is untouched: `lg:hidden`, because on a wide screen the buy column is
 * already visible beside the gallery.
 */
import { useEffect, useState } from "react";
import { Loader2, ShoppingBag } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useCartStore } from "@/store/cart.store";
import { toast } from "@/store/toast.store";

export function StickyBuyBar({
  productId,
  productName,
  price,
  inStock,
  stock,
}: {
  productId: string;
  productName: string;
  price: number;
  inStock: boolean;
  stock: number;
}) {
  const addItem = useCartStore((state) => state.addItem);
  const [visible, setVisible] = useState(false);
  const [adding, setAdding] = useState(false);

  /*
   * Measure the real buy area rather than guess a scroll offset: `data-buy-anchor`
   * wraps the price + add-to-cart block on the page. Reading it on each rAF-throttled
   * scroll frame costs nothing and stays correct at every viewport height.
   */
  useEffect(() => {
    let frame = 0;

    const evaluate = () => {
      frame = 0;
      const anchor = document.querySelector("[data-buy-anchor]");

      if (anchor) {
        setVisible(anchor.getBoundingClientRect().bottom < 0);
      } else {
        setVisible(window.scrollY > 560);
      }
    };

    const onScroll = () => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(evaluate);
      }
    };

    evaluate();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  const available = inStock && stock > 0;

  const onClick = async () => {
    setAdding(true);
    const added = await addItem(productId, 1);
    setAdding(false);

    if (added) {
      toast.success(`${productName} added to your cart`);
    }
  };

  return (
    <div
      className={[
        "fixed inset-x-0 bottom-0 z-40 border-t border-cream-300 bg-cream-50/95 px-4 py-3 backdrop-blur lg:hidden",
        "transition-transform duration-300 ease-out motion-reduce:transition-none",
        visible ? "translate-y-0" : "pointer-events-none translate-y-full",
      ].join(" ")}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      aria-hidden={!visible}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-bark-500">{productName}</p>
          <p className="text-base font-semibold text-bark-950">
            {formatCurrency(price)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onClick()}
          disabled={!available || adding}
          tabIndex={visible ? 0 : -1}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-baby-400 px-5 py-2.5 text-sm font-semibold text-bark-950 transition-colors hover:bg-baby-300 disabled:cursor-not-allowed disabled:bg-cream-300 disabled:text-bark-500"
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ShoppingBag className="h-4 w-4" aria-hidden />
          )}
          {available ? (adding ? "Adding…" : "Add to cart") : "Sold out"}
        </button>
      </div>
    </div>
  );
}
