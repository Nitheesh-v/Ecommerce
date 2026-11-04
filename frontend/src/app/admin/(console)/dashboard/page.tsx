import type { Metadata } from "next";
import { DashboardView } from "@/components/admin/dashboard/dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * This page is a client-rendered, auth-gated shell: `AdminShell` renders only a
 * skeleton until the session is restored in the browser, so the segment never
 * renders during Next 16's instant-navigation validation pass (the dev overlay
 * reports it as "dropped from rendering"). Opting out is the accurate signal —
 * it affects validation only, never rendering or navigation.
 *
 * Convention: every page inside `admin/(console)` that is mounted behind
 * `AdminShell` keeps this export.
 */
export const instant = false;

export default function AdminDashboardPage() {
  return <DashboardView />;
}
