import type { Metadata } from "next";
import { InventoryView } from "@/components/admin/inventory/inventory-view";

export const metadata: Metadata = {
  title: "Inventory",
};

/**
 * Client-rendered console page (inventory is loaded after the session is
 * restored) — opts out of Next 16's instant-navigation validation, like every
 * other page in `admin/(console)`.
 */
export const instant = false;

export default function AdminInventoryPage() {
  return <InventoryView />;
}
