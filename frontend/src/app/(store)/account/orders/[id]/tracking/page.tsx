import type { Metadata } from "next";
import { OrderTrackingView } from "@/components/store/order-tracking-view";

export const metadata: Metadata = {
  title: "Track your order",
  robots: { index: false, follow: false },
};

/** Per-session data: never cached or statically prerendered. */
export const instant = false;

export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <OrderTrackingView orderId={id} />
    </div>
  );
}
