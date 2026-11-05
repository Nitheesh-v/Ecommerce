import type { Metadata } from "next";
import { AccountView } from "@/components/store/account/account-view";
import { RequireCustomer } from "@/components/store/account/require-customer";

export const metadata: Metadata = {
  title: "My account",
  description: "Your Ecommerce26 profile, orders and reviews.",
};

export default function AccountPage() {
  return (
    <RequireCustomer>
      <AccountView />
    </RequireCustomer>
  );
}
