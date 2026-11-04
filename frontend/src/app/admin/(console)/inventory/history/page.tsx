import type { Metadata } from "next";
import { StockHistoryView } from "@/components/admin/inventory/stock-history-view";

export const metadata: Metadata = {
  title: "Stock history",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default async function AdminStockHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>;
}) {
  // Deep link from the inventory table (`?productId=`), so one product's audit
  // trail can be opened directly.
  const { productId } = await searchParams;

  return <StockHistoryView productId={productId} />;
}
