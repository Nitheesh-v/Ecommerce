// src/app/(store)/checkout/page.tsx

import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout/checkout-view";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Confirm your delivery address and payment method.",
  robots: { index: false, follow: false },
};

/** Checkout is per-session state; it is never cached or prerendered. */
export const instant = false;

export default function CheckoutPage() {
  return <CheckoutView />;
}
