// src/app/(store)/cart/page.tsx

import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";

export const metadata: Metadata = {
  title: "Your cart",
  description: "Review the items in your Ecommerce26 cart before checkout.",
  robots: { index: false, follow: false },
};

/** The cart is per-session state; it is never cached or prerendered. */
export const instant = false;

export default function CartPage() {
  return <CartView />;
}
