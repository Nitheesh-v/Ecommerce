import type { Metadata } from "next";
import { OrderDetailView } from "@/components/admin/orders/order-detail-view";

export const metadata: Metadata = {
  title: "Order",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <OrderDetailView orderId={id} />;
}
