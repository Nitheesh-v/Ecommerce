// src/app/(store)/account/orders/[id]/invoice/page.tsx

import type { Metadata } from "next";
import { OrderInvoiceView } from "@/components/store/account/order-invoice";
import { RequireCustomer } from "@/components/store/account/require-customer";

export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
};

/** Per-session data: never cached or statically prerendered. */
export const instant = false;

export default async function OrderInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequireCustomer>
      <div className="mx-auto w-full max-w-3xl">
        <OrderInvoiceView orderId={id} />
      </div>
    </RequireCustomer>
  );
}
