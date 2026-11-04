import type { Metadata } from "next";
import { PayOrderView } from "@/components/store/pay-order-view";

export const metadata: Metadata = {
  title: "Pay for your order",
  robots: { index: false, follow: false },
};

/** Checkout is per-session state; never cached or statically prerendered. */
export const instant = false;

export default async function PayOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  return <PayOrderView orderId={orderId} />;
}
