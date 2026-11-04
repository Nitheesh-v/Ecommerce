import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/layout/admin-shell";

/**
 * Every route in this group requires an authenticated admin.
 *
 * Note: the guard is a client component that does not render `children` on the
 * server, so pages in this group opt out of Next 16's instant-navigation
 * validation with `export const instant = false` (a page-level flag — the same
 * export on a layout is ignored). See `dashboard/page.tsx`.
 */
export default function AdminConsoleLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
