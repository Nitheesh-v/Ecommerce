import type { Metadata } from "next";
import { OfferFormView } from "@/components/admin/offers/offer-form-view";

export const metadata: Metadata = {
  title: "New offer",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default function AdminOfferCreatePage() {
  return <OfferFormView />;
}
