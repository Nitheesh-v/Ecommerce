import type { Metadata } from "next";
import { ShipmentDetailView } from "@/components/admin/shipping/shipment-detail-view";

export const metadata: Metadata = {
  title: "Shipment",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default async function AdminShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ShipmentDetailView shipmentId={id} />;
}
