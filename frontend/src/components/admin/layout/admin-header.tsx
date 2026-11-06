"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ChevronDown,
  LogOut,
  Menu,
  PanelLeft,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import { AdminNotificationBell } from "@/components/admin/notifications/admin-notification-bell";
import { cn, initialsOf } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import { buildBreadcrumbs, titleForPath } from "./nav-config";
import { Popover } from "./popover";

const iconButtonClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900";

export function AdminHeader() {
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const breadcrumbs = buildBreadcrumbs(pathname);
  const title = titleForPath(pathname);
  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ")
    : "Admin";

  return (
    <header
      data-print-hidden
      className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open navigation"
        className={cn(iconButtonClass, "lg:hidden")}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
        title="Toggle sidebar"
        className={cn(iconButtonClass, "hidden lg:inline-flex")}
      >
        <PanelLeft className="h-[18px] w-[18px]" aria-hidden />
      </button>

      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold text-slate-900">
          {title}
        </h1>
        <nav aria-label="Breadcrumb" className="hidden sm:block">
          <ol className="flex items-center gap-1.5 text-xs text-slate-500">
            {breadcrumbs.map((crumb) => (
              <li key={crumb.href} className="flex items-center gap-1.5">
                {crumb.isCurrent ? (
                  <span className="text-slate-600" aria-current="page">
                    {crumb.label}
                  </span>
                ) : (
                  <>
                    <Link
                      href={crumb.href}
                      className="transition-colors hover:text-slate-900"
                    >
                      {crumb.label}
                    </Link>
                    <span aria-hidden>/</span>
                  </>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <div className="relative hidden md:block">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            disabled
            placeholder="Search (coming soon)"
            aria-label="Global search"
            title="Global search will be enabled once the products and orders modules exist"
            className="h-9 w-56 cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 pl-9 text-sm text-slate-500 placeholder:text-slate-400 lg:w-64"
          />
        </div>

        <AdminNotificationBell />

        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            className="flex items-center gap-2 rounded-lg py-1 pr-1.5 pl-1 transition-colors hover:bg-slate-100"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {initialsOf(displayName) || "A"}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block max-w-[10rem] truncate text-sm font-medium text-slate-900">
                {displayName}
              </span>
              <span className="block text-[11px] text-slate-500 capitalize">
                {user?.role ?? "admin"}
              </span>
            </span>
            <ChevronDown
              className="hidden h-4 w-4 text-slate-400 sm:block"
              aria-hidden
            />
          </button>

          <Popover
            open={profileOpen}
            onClose={() => setProfileOpen(false)}
          >
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="truncate text-sm font-medium text-slate-900">
                {displayName}
              </p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
            <div className="p-1.5">
              <span
                aria-disabled="true"
                className="flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-400"
              >
                <UserRound className="h-4 w-4" aria-hidden />
                My profile
                <span className="ml-auto text-[10px] font-medium tracking-wide uppercase">
                  Soon
                </span>
              </span>
              <span
                aria-disabled="true"
                className="flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-400"
              >
                <Settings className="h-4 w-4" aria-hidden />
                Store settings
                <span className="ml-auto text-[10px] font-medium tracking-wide uppercase">
                  Soon
                </span>
              </span>
            </div>
            <div className="border-t border-slate-100 p-1.5">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  void logout();
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-50"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </button>
            </div>
          </Popover>
        </div>
      </div>
    </header>
  );
}
