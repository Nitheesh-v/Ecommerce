import type { Metadata } from "next";
import { ProductCreateView } from "@/components/admin/products/product-create-view";

export const metadata: Metadata = {
  title: "Add product",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default function AdminCreateProductPage() {
  return <ProductCreateView />;
}
