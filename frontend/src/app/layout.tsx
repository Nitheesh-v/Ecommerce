import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

/**
 * Fonts are self-hosted through the `geist` package instead of
 * `next/font/google`: builds no longer need network access to
 * fonts.googleapis.com, which keeps CI and offline builds deterministic.
 */
export const metadata: Metadata = {
  title: {
    default: "Ecommerce",
    template: "%s | Ecommerce",
  },
  description: "Single-vendor e-commerce storefront.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
