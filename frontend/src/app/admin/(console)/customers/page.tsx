import type { Metadata } from "next";
import { CustomersView } from "@/components/admin/customers/customers-view";

export const metadata: Metadata = {
  title: "Customers",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default function AdminCustomersPage() {
  return <CustomersView />;
}
