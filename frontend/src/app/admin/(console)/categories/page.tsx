import type { Metadata } from "next";
import { CategoriesView } from "@/components/admin/categories/categories-view";

export const metadata: Metadata = {
  title: "Categories",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default function AdminCategoriesPage() {
  return <CategoriesView />;
}
