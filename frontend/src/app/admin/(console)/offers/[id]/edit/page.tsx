import type { Metadata } from "next";
import { OfferFormView } from "@/components/admin/offers/offer-form-view";

export const metadata: Metadata = {
  title: "Edit offer",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default async function AdminOfferEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <OfferFormView offerId={id} />;
}
