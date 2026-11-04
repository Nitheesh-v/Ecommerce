import type { Metadata } from "next";
import { PaymentDetailView } from "@/components/admin/payments/payment-detail-view";

export const metadata: Metadata = {
  title: "Payment",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default async function AdminPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <PaymentDetailView paymentId={id} />;
}
