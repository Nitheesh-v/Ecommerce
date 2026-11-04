import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "Admin · Ecommerce26", template: "%s · Admin" },
  robots: { index: false, follow: false },
};

/** Shared by `/admin/login` and the guarded `(console)` group. */
export default function AdminRootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
