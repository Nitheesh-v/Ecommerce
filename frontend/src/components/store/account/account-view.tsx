"use client";

import Link from "next/link";
import { ChevronRight, Heart, Package, Star, UserRound } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useCustomerAuthStore } from "@/store/customer-auth.store";

const LINKS = [
  {
    href: "/account/orders",
    label: "My orders",
    description: "Track deliveries, download invoices, request returns",
    icon: Package,
  },
  {
    href: "/offers",
    label: "Offers for you",
    description: "Live coupons you can apply at checkout",
    icon: Heart,
  },
  {
    href: "/products",
    label: "Keep shopping",
    description: "Browse the catalogue",
    icon: Star,
  },
];

/** Signed-in profile summary: who you are, and the two things customers come back for. */
export function AccountView() {
  const user = useCustomerAuthStore((state) => state.user);

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Hello, {user.firstName}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Your account, orders and reviews in one place.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:col-span-1">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
            {(user.firstName[0] ?? "") + (user.lastName?.[0] ?? "")}
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-900">
            {user.firstName} {user.lastName ?? ""}
          </p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <dl className="mt-4 space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Member since</dt>
              <dd className="font-medium text-slate-700">{formatDate(user.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Account type</dt>
              <dd className="font-medium text-slate-700 capitalize">{user.role}</dd>
            </div>
          </dl>
        </div>

        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-1">
          {LINKS.map(({ href, label, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">{label}</span>
                <span className="block text-xs text-slate-500">{description}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden />
            </Link>
          ))}
        </div>
      </div>

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <UserRound className="h-3.5 w-3.5" aria-hidden />
        Need to change your details? Contact the store and an administrator will update
        the account — nothing here is edited in the browser.
      </p>
    </div>
  );
}
