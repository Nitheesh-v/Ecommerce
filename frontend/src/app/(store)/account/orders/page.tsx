import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { OrdersList } from "@/components/store/account/orders-list";
import { RequireCustomer } from "@/components/store/account/require-customer";

export const metadata: Metadata = {
  title: "My orders",
  description: "Track your Ecommerce26 orders.",
};

export default function AccountOrdersPage() {
  return (
    <RequireCustomer>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              My orders
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Every order you have placed, with its delivery timeline.
            </p>
          </div>
          <Link
            href="/account"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Account
          </Link>
        </div>

        <OrdersList />
      </div>
    </RequireCustomer>
  );
}
