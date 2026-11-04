import type { Metadata } from "next";
import { OffersView } from "@/components/admin/offers/offers-view";

export const metadata: Metadata = {
  title: "Offers & coupons",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default function AdminOffersPage() {
  return <OffersView />;
}
