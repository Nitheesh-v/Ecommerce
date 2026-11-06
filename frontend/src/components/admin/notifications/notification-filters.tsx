"use client";

// src/components/admin/notifications/notification-filters.tsx

import { RotateCcw, Search } from "lucide-react";
import { Input } from "@/components/admin/ui/input";
import { Select } from "@/components/admin/ui/select";
import type { NotificationFilters } from "@/hooks/use-notification-list";

const TYPES = [
  { value: "order_placed", label: "Order placed" },
  { value: "order_confirmed", label: "Order confirmed" },
  { value: "order_shipped", label: "Order shipped" },
  { value: "order_out_for_delivery", label: "Out for delivery" },
  { value: "order_delivered", label: "Order delivered" },
  { value: "order_cancelled", label: "Order cancelled" },
  { value: "payment_failed", label: "Payment failed" },
  { value: "refund_processed", label: "Refund issued" },
  { value: "delivery_failed", label: "Delivery failed" },
  { value: "inventory_low", label: "Low stock" },
  { value: "inventory_out", label: "Out of stock" },
  { value: "review_submitted", label: "Review submitted" },
  { value: "welcome", label: "Welcome" },
] as const;

const CATEGORIES = [
  { value: "order", label: "Orders" },
  { value: "payment", label: "Payments" },
  { value: "shipping", label: "Shipping" },
  { value: "inventory", label: "Inventory" },
  { value: "review", label: "Reviews" },
  { value: "account", label: "Accounts" },
] as const;

const EMAIL_STATUSES = [
  { value: "delivered", label: "Email sent" },
  { value: "skipped", label: "Email skipped" },
  { value: "failed", label: "Email failed" },
  { value: "pending", label: "Email pending" },
] as const;

/** Search, audience, type, category, email state, unread and a date window. */
export function NotificationFiltersBar({
  filters,
  onChange,
  onReset,
  hasActiveFilters,
  total,
}: {
  filters: NotificationFilters;
  onChange: (patch: Partial<NotificationFilters>) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
  total: number;
}) {
  return (
    <div className="space-y-3 border-b border-slate-100 px-5 py-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <Input
            type="search"
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Search title, message or recipient…"
            aria-label="Search notifications"
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 lg:w-auto lg:grid-cols-4">
          <Select
            value={filters.audience}
            onChange={(event) =>
              onChange({ audience: event.target.value as NotificationFilters["audience"] })
            }
            aria-label="Audience"
            className="lg:w-36"
          >
            <option value="admin">Shop alerts</option>
            <option value="customer">Customer mail</option>
          </Select>

          <Select
            value={filters.type}
            onChange={(event) =>
              onChange({ type: event.target.value as NotificationFilters["type"] })
            }
            aria-label="Filter by type"
            className="lg:w-44"
          >
            <option value="">All types</option>
            {TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select
            value={filters.category}
            onChange={(event) =>
              onChange({ category: event.target.value as NotificationFilters["category"] })
            }
            aria-label="Filter by category"
            className="lg:w-36"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select
            value={filters.emailStatus}
            onChange={(event) =>
              onChange({
                emailStatus: event.target.value as NotificationFilters["emailStatus"],
              })
            }
            aria-label="Filter by email state"
            className="lg:w-40"
          >
            <option value="">Any email state</option>
            {EMAIL_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={filters.unreadOnly}
              onChange={(event) => onChange({ unreadOnly: event.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
            />
            Unread only
          </label>

          <label className="inline-flex items-center gap-2 text-xs text-slate-500">
            From
            <Input
              type="date"
              value={filters.from}
              onChange={(event) => onChange({ from: event.target.value })}
              aria-label="From date"
              className="h-8 w-36 text-xs"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-500">
            To
            <Input
              type="date"
              value={filters.to}
              onChange={(event) => onChange({ to: event.target.value })}
              aria-label="To date"
              className="h-8 w-36 text-xs"
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-500">
            {total} {total === 1 ? "notification" : "notifications"}
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Clear filters
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
