import type { Metadata } from "next";
import { ProductDetailView } from "@/components/admin/products/product-detail-view";

export const metadata: Metadata = {
  title: "Product",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default async function AdminProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ProductDetailView id={id} />;
}
