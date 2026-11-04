import type { Metadata } from "next";
import { CategoryEditView } from "@/components/admin/categories/category-edit-view";

export const metadata: Metadata = {
  title: "Edit category",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default async function AdminEditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <CategoryEditView id={id} />;
}
