import type { Metadata } from "next";
import { ProductsView } from "@/components/admin/products/products-view";

export const metadata: Metadata = {
  title: "Products",
};

/**
 * Client-rendered console page: the product table is loaded from the API after
 * the session is restored, so it opts out of Next 16's instant-navigation
 * validation pass. Convention shared by every page in `admin/(console)`.
 */
export const instant = false;

export default function AdminProductsPage() {
  return <ProductsView />;
}
