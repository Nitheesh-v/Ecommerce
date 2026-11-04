import type { Metadata } from "next";
import { RedemptionsView } from "@/components/admin/offers/redemptions-view";

export const metadata: Metadata = {
  title: "Coupon redemptions",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default function AdminRedemptionsPage() {
  return <RedemptionsView />;
}
