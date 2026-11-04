import type { Metadata } from "next";
import { OrderInvoiceView } from "@/components/admin/orders/order-invoice-view";

export const metadata: Metadata = {
  title: "Invoice",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default async function AdminOrderInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <OrderInvoiceView orderId={id} />;
}
