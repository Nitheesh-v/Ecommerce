import type { Metadata } from "next";
import { ProductEditView } from "@/components/admin/products/product-edit-view";

export const metadata: Metadata = {
  title: "Edit product",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default async function AdminEditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ProductEditView id={id} />;
}
