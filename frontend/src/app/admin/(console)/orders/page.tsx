import type { Metadata } from "next";
import { OrdersView } from "@/components/admin/orders/orders-view";

export const metadata: Metadata = {
  title: "Orders",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default function AdminOrdersPage() {
  return <OrdersView />;
}
