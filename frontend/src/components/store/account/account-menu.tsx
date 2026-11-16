"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LogOut, Package, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCustomerAuthStore } from "@/store/customer-auth.store";

/**
 * Header account control.
 *
 * Bootstraps the session once per mount (silent refresh against the HttpOnly
 * cookie), so a reload does not look like a sign-out. Signed out, it links to the
 * login page with a `next` so the customer returns to the page they were on.
 */
export function AccountMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  const user = useCustomerAuthStore((state) => state.user);
  const status = useCustomerAuthStore((state) => state.status);
  const bootstrap = useCustomerAuthStore((state) => state.bootstrap);
  const logout = useCustomerAuthStore((state) => state.logout);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // The pathname is only known in the browser; `next` keeps the redirect honest.
  const next = pathname && pathname !== "/login" ? pathname : "/account";

  if (status === "loading" || status === "idle") {
    return <div className="h-9 w-24 animate-pulse rounded-full bg-bark-800" aria-hidden />;
  }

  if (!user) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(next)}`}
        className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium text-cream-200 transition-colors hover:bg-cream-50/10 hover:text-cream-50"
      >
        <UserRound className="h-4 w-4" aria-hidden />
        Sign in
      </Link>
    );
  }

  const initials = `${user.firstName[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase();

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-medium text-cream-100 transition-colors hover:bg-cream-50/10"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cream-50 text-[11px] font-semibold text-bark-900">
          {initials || "U"}
        </span>
        <span className="hidden sm:inline">{user.firstName}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-cream-300 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-xl shadow-bark-900/10"
        >
          <div className="border-b border-cream-200 px-4 py-3">
            <p className="truncate text-sm font-medium text-bark-950">
              {user.firstName} {user.lastName ?? ""}
            </p>
            <p className="truncate text-xs text-bark-500">{user.email}</p>
          </div>

          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-bark-800 hover:bg-cream-100"
          >
            <UserRound className="h-4 w-4 text-bark-400" aria-hidden />
            My account
          </Link>
          <Link
            href="/account/orders"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-bark-800 hover:bg-cream-100"
          >
            <Package className="h-4 w-4 text-bark-400" aria-hidden />
            My orders
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await logout();
              router.push("/");
            }}
            className="flex w-full items-center gap-2 border-t border-cream-200 px-4 py-2.5 text-sm text-bark-800 hover:bg-cream-100"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
