import type { Metadata } from "next";
import { ReportsView } from "@/components/admin/reports/reports-view";

export const metadata: Metadata = {
  title: "Reports",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default function AdminReportsPage() {
  return <ReportsView />;
}
