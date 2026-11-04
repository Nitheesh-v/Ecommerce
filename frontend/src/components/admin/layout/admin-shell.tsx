"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import { Button } from "../ui/button";
import { Toaster } from "../ui/toaster";
import { AdminHeader } from "./admin-header";
import { AdminSidebar } from "./admin-sidebar";

/**
 * Client-side gate for every `/admin` console route.
 *
 * This is UX, not security: the API re-checks the role on every request via
 * `RolesGuard`, so a tampered UI can never read admin data. The shell simply
 * avoids rendering a console for anonymous visitors and uses the HttpOnly
 * refresh cookie to restore a session on reload.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const logout = useAuthStore((state) => state.logout);
  const collapsed = useUiStore((state) => state.sidebarCollapsed);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, pathname, router]);

  if (status === "idle" || status === "loading" || !user) {
    return <ShellSkeleton />;
  }

  if (user.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <ShieldAlert className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">
            Admin access required
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            You are signed in as <strong>{user.email}</strong>, which is a
            customer account. Sign out and use an administrator account to open
            the console.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <Button variant="secondary" onClick={() => void logout()}>
              Sign out
            </Button>
            <Link
              href="/"
              className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              Back to store
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminSidebar />
      <div
        data-console-content
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-200 ease-out motion-reduce:transition-none",
          collapsed ? "lg:pl-[4.75rem]" : "lg:pl-64",
        )}
      >
        <AdminHeader />
        <main
          data-console-main
          className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-slate-900 lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-white/5 px-4">
          <div className="h-9 w-9 animate-pulse rounded-lg bg-white/10" />
          <div className="space-y-1.5">
            <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
            <div className="h-2.5 w-16 animate-pulse rounded bg-white/5" />
          </div>
        </div>
        <div className="space-y-2 p-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-8 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      </div>
      <div className="flex min-h-screen flex-col lg:pl-64">
        <div className="flex h-16 items-center border-b border-slate-200 bg-white px-6">
          <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Restoring your session…
        </div>
      </div>
    </div>
  );
}
