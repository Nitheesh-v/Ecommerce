import type { Metadata } from "next";
import { RedemptionsView } from "@/components/admin/offers/redemptions-view";

export const metadata: Metadata = {
  title: "Offer redemptions",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default async function AdminOfferRedemptionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <RedemptionsView offerId={id} />;
}
