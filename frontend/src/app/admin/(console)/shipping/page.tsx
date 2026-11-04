import type { Metadata } from "next";
import { ShipmentsView } from "@/components/admin/shipping/shipments-view";

export const metadata: Metadata = {
  title: "Shipping",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default function AdminShippingPage() {
  return <ShipmentsView />;
}
