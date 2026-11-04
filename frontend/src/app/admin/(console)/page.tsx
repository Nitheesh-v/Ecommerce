import { redirect } from "next/navigation";

/** See `dashboard/page.tsx` — console pages opt out of instant validation. */
export const instant = false;

export default function AdminIndexPage() {
  redirect("/admin/dashboard");
}
