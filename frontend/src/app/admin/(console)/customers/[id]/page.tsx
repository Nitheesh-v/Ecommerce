import type { Metadata } from "next";
import { CustomerDetailView } from "@/components/admin/customers/customer-detail-view";

export const metadata: Metadata = {
  title: "Customer",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <CustomerDetailView customerId={id} />;
}
