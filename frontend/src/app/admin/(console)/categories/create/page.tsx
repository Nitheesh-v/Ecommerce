import type { Metadata } from "next";
import { CategoryCreateView } from "@/components/admin/categories/category-create-view";

export const metadata: Metadata = {
  title: "Add category",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default function AdminCreateCategoryPage() {
  return <CategoryCreateView />;
}
