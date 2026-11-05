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
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
        <LogIn className="mx-auto h-6 w-6 text-slate-300" aria-hidden />
        <h1 className="mt-3 text-base font-semibold text-slate-900">Sign in to continue</h1>
        <p className="mt-1 text-sm text-slate-500">
          This page shows your own orders, so it needs an account.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(pathname || "/account")}`}
          className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-slate-100" aria-hidden />
      <div className="h-64 w-full animate-pulse rounded-xl bg-slate-100" aria-hidden />
    </div>
  );
}
