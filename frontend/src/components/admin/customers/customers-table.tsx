"use client";

import Link from "next/link";
import { ArrowDownUp, ExternalLink } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/admin/ui/table";
import { Skeleton } from "@/components/admin/ui/states";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { Customer, CustomerSortField } from "@/types/customer";
import { CustomerAvatar, CustomerStatusBadge } from "./customer-badges";

const COLUMNS = [
  "Customer",
  "Phone",
  "Registered",
  "Orders",
  "Successful",
  "Total spending",
  "Last order",
  "Status",
  "",
];

export function CustomersTable({
  items,
  loading,
  sortBy,
  sortOrder,
  onSort,
}: {
  items: Customer[];
  loading: boolean;
  sortBy: CustomerSortField;
  sortOrder: "asc" | "desc";
  onSort: (field: CustomerSortField) => void;
}) {
  const sortable: Record<string, CustomerSortField | undefined> = {
    Customer: "name",
    Registered: "createdAt",
    "Total spending": "netSpent",
  };

  return (
    <Table className="min-w-[64rem]">
      <TableHead>
        {COLUMNS.map((column, index) => {
          const field = sortable[column];
          const active = field !== undefined && sortBy === field;

          return (
            <TableHeaderCell
              key={`${column}-${index}`}
              aria-sort={
                active ? (sortOrder === "asc" ? "ascending" : "descending") : "none"
              }
            >
              {field ? (
                <button
                  type="button"
                  onClick={() => onSort(field)}
                  className={cn(
                    "inline-flex items-center gap-1 transition-colors hover:text-slate-800",
                    active ? "text-slate-900" : "text-slate-500",
                  )}
                >
                  {column}
                  <ArrowDownUp
                    className={cn("h-3 w-3", active ? "opacity-90" : "opacity-40")}
                    aria-hidden
                  />
                </button>
              ) : (
                column
              )}
            </TableHeaderCell>
          );
        })}
      </TableHead>

      <TableBody>
        {loading
          ? Array.from({ length: 6 }).map((_, row) => (
              <TableRow key={`skeleton-${row}`}>
                {COLUMNS.map((column, index) => (
                  <TableCell key={`${column}-${index}`}>
                    <Skeleton className="h-3 w-16" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          : items.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <CustomerAvatar name={customer.fullName} imageUrl={customer.avatarUrl} />
                    <div className="min-w-0">
                      <Link
                        href={`/admin/customers/${customer.id}`}
                        className="line-clamp-1 font-medium text-slate-900 hover:underline"
                      >
                        {customer.fullName}
                      </Link>
                      <p className="line-clamp-1 text-xs text-slate-500">
                        {customer.email}
                      </p>
                      <p className="text-[10px] text-slate-400">#{customer.id.slice(-8)}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-slate-700">
                  {customer.phone ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-slate-500">
                  {formatDate(customer.createdAt)}
                </TableCell>
                <TableCell className="tabular-nums">{customer.metrics.totalOrders}</TableCell>
                <TableCell className="tabular-nums">
                  {customer.metrics.successfulOrders}
                </TableCell>
                <TableCell className="font-semibold whitespace-nowrap text-slate-900">
                  {formatCurrency(customer.metrics.totalSpent)}
                  {customer.metrics.refundedAmount > 0 ? (
                    <span className="block text-[10px] font-normal text-slate-400">
                      − {formatCurrency(customer.metrics.refundedAmount)} refunded
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-slate-500">
                  {customer.metrics.lastOrderAt
                    ? formatDate(customer.metrics.lastOrderAt)
                    : "—"}
                </TableCell>
                <TableCell>
                  <CustomerStatusBadge status={customer.status} />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/customers/${customer.id}`}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    aria-label={`Open ${customer.fullName}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    View
                  </Link>
                </TableCell>
              </TableRow>
            ))}
      </TableBody>
    </Table>
  );
}
