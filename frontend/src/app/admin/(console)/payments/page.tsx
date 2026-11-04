import type { Metadata } from "next";
import { PaymentsView } from "@/components/admin/payments/payments-view";

export const metadata: Metadata = {
  title: "Payments",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default function AdminPaymentsPage() {
  return <PaymentsView />;
}
