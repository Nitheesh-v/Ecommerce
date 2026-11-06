// src/app/(store)/checkout/success/page.tsx

import type { Metadata } from "next";
import { SuccessView } from "@/components/checkout/success-view";

export const metadata: Metadata = {
  title: "Order confirmed",
  robots: { index: false, follow: false },
};

/** The order id arrives in the query string, so this page cannot be prerendered. */
export const instant = false;

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string | string[] }>;
}) {
  const { orderId } = await searchParams;
  const single = Array.isArray(orderId) ? orderId[0] : orderId;

  return <SuccessView orderId={single ?? ""} />;
}
