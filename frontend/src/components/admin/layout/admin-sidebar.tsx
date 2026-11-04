"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { LogOut, Store, X } from "lucide-react";
import { cn, initialsOf } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import { ADMIN_NAV, type AdminNavItem } from "./nav-config";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: AdminNavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const labelClass = cn("truncate", collapsed && "lg:hidden");

  const shared = cn(
    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
    collapsed && "lg:justify-center lg:px-0",
  );

  if (!item.available) {
    return (
      <span
        title={collapsed ? `${item.label} (coming soon)` : undefined}
        aria-disabled="true"
        className={cn(shared, "cursor-default text-slate-500/80")}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
        <span className={cn(labelClass, "flex-1")}>{item.label}</span>
        {!collapsed ? (
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-slate-400 uppercase">
            Soon
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        shared,
        active
          ? "bg-white/10 font-medium text-white"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
      )}
    >
      {active ? (
        <span
          className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r bg-indigo-400"
          aria-hidden
        />
      ) : null}
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
      <span className={labelClass}>{item.label}</span>
    </Link>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const mobileNavOpen = useUiStore((state) => state.mobileNavOpen);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  // Close the mobile drawer after navigating.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, setMobileNavOpen]);

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ")
    : "Admin";

  return (
    <>
      {mobileNavOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-[1px] lg:hidden"
        />
      ) : null}

      <aside
        aria-label="Admin navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 transition-[transform,width] duration-200 ease-out",
          "motion-reduce:transition-none",
          collapsed && "lg:w-[4.75rem]",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/5 px-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white">
            <Store className="h-5 w-5" aria-hidden />
          </span>
          <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
            <p className="truncate text-sm font-semibold text-white">
              Ecommerce26
            </p>
            <p className="truncate text-xs text-slate-400">Admin console</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
          {ADMIN_NAV.map((section, index) => (
            <div key={section.label} className={cn(index > 0 && "mt-5")}>
              {collapsed ? (
                <div className="mx-2 mb-2 hidden h-px bg-white/5 lg:block" />
              ) : null}
              <p
                className={cn(
                  "mb-2 px-3 text-[10px] font-semibold tracking-wider text-slate-500 uppercase",
                  collapsed && "lg:hidden",
                )}
              >
                {section.label}
              </p>
              <ul className="space-y-1">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      collapsed={collapsed}
                      active={isActive(pathname, item.href)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/5 p-3">
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg px-1 py-1",
              collapsed && "lg:flex-col lg:gap-2 lg:px-0",
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-white">
              {initialsOf(displayName) || "A"}
            </span>
            <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
              <p className="truncate text-sm font-medium text-white">
                {displayName}
              </p>
              <p className="truncate text-xs text-slate-400">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              title="Sign out"
              aria-label="Sign out"
              className="rounded-md p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
