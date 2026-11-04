import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/layout/admin-shell";

/** Every route in this group requires an authenticated admin. */
export default function AdminConsoleLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
