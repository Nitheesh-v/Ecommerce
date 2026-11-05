import type { Metadata } from "next";
import { SettingsView } from "@/components/admin/settings/settings-view";

export const metadata: Metadata = {
  title: "Store settings",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default function AdminSettingsPage() {
  return <SettingsView />;
}
