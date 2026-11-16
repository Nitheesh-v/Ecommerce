"use client";

// src/components/store/quick-add.tsx

/**
 * Add-to-cart from a catalogue card.
 *
 * Browsing used to end only on the product page: a card had exactly one action
 * (open the detail view), so buying two things meant two round trips. This sits
 * on the card image and adds the product without leaving the grid.
 *
 * Behaviour mirrors `AddToCartButton`, deliberately: the API's cart is per
 * account, so a signed-out click sends the shopper to sign in with the current
 * page in `next` and nothing is lost. The control is a sibling of the card's
 * link, never a child, because a button inside an anchor is invalid HTML and
 * unreachable by keyboard in some browsers.
 */
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/store/cart.store";
import { useCustomerAuthStore } from "@/store/customer-auth.store";
import { toast } from "@/store/toast.store";

type Phase = "idle" | "adding" | "added";

const ADDED_FEEDBACK_MS = 1_800;

export function QuickAdd({
  productId,
  productName,
  className,
}: {
  productId: string;
  productName: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const addItem = useCartStore((state) => state.addItem);
  const authStatus = useCustomerAuthStore((state) => state.status);
  const [phase, setPhase] = useState<Phase>("idle");

  const onClick = async () => {
    if (authStatus === "unauthenticated") {
      router.push(`/login?next=${encodeURIComponent(pathname || "/products")}`);

      return;
    }

    setPhase("adding");

    const added = await addItem(productId, 1);

    if (!added) {
      setPhase("idle");

      return;
    }

    toast.success(`${productName} added to your cart`);
    setPhase("added");
    window.setTimeout(() => setPhase("idle"), ADDED_FEEDBACK_MS);
  };

  const busy = phase !== "idle";

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      aria-label={
        phase === "added" ? `${productName} added to cart` : `Add ${productName} to cart`
      }
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full",
        "bg-bark-900 text-cream-50 shadow-lift transition-colors",
        "hover:bg-bark-950 disabled:cursor-not-allowed",
        phase === "added" && "bg-emerald-600 hover:bg-emerald-600",
        className,
      )}
    >
      {phase === "adding" ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : phase === "added" ? (
        <Check className="h-4 w-4" aria-hidden />
      ) : (
        <Plus className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}
