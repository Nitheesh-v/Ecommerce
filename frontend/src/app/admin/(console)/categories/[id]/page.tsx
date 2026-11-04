import type { Metadata } from "next";
import { CategoryDetailView } from "@/components/admin/categories/category-detail-view";

export const metadata: Metadata = {
  title: "Category",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default async function AdminCategoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <CategoryDetailView id={id} />;
}
