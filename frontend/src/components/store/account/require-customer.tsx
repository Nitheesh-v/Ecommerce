"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useCustomerAuthStore } from "@/store/customer-auth.store";

/**
 * Gate for customer-only screens.
 *
 * The API is still the authority — every request it serves is scoped to the caller —
 * so this only decides what to *render*: a skeleton while the refresh cookie is
 * being checked, and a sign-in prompt (with a `next`) when there is no session.
 */
export function RequireCustomer({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useCustomerAuthStore((state) => state.user);
  const status = useCustomerAuthStore((state) => state.status);
  const bootstrap = useCustomerAuthStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    // Only redirect once the session check has actually finished.
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/account")}`);
    }
  }, [pathname, router, status]);

  if (status === "authenticated" && user) {
    return <>{children}</>;
  }

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-cream-300 bg-cream-50 px-6 py-12 text-center">
        <LogIn className="mx-auto h-6 w-6 text-cream-400" aria-hidden />
        <h1 className="mt-3 text-base font-semibold text-bark-900">Sign in to continue</h1>
        <p className="mt-1 text-sm text-bark-500">
          This page shows your own orders, so it needs an account.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(pathname || "/account")}`}
          className="mt-4 inline-flex rounded-lg bg-baby-400 px-4 py-2 text-sm font-medium text-bark-950 hover:bg-baby-300"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-cream-200" aria-hidden />
      <div className="h-64 w-full animate-pulse rounded-xl bg-cream-200" aria-hidden />
    </div>
  );
}
