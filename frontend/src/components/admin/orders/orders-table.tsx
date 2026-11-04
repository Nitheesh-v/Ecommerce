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
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import {
  PAYMENT_METHOD_LABELS,
  type Order,
  type OrderSortField,
} from "@/types/order";
import { OrderStatusBadge, PaymentStatusBadge } from "./order-badges";

const COLUMNS = [
  "Order",
  "Customer",
  "Date",
  "Items",
  "Subtotal",
  "Discount",
  "Shipping",
  "Tax",
  "Total",
  "Payment",
  "Status",
  "",
];

export function OrdersTable({
  items,
  loading,
  sortBy,
  sortOrder,
  onSort,
}: {
  items: Order[];
  loading: boolean;
  sortBy: OrderSortField;
  sortOrder: "asc" | "desc";
  onSort: (field: OrderSortField) => void;
}) {
  const sortable: Partial<Record<string, OrderSortField>> = {
    Date: "createdAt",
    Total: "total",
  };

  return (
    <Table className="min-w-[72rem]">
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
                {COLUMNS.map((_column, index) => (
                  <TableCell key={index}>
                    <Skeleton className="h-3 w-16" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          : items.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {order.orderNumber}
                  </Link>
                </TableCell>
                <TableCell className="max-w-48">
                  <span className="line-clamp-1 text-slate-800">{order.customerName}</span>
                  <span className="line-clamp-1 text-xs text-slate-500">
                    {order.customerEmail}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-slate-500">
                  {formatDateTime(order.createdAt)}
                </TableCell>
                <TableCell className="tabular-nums">{order.itemCount}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatCurrency(order.subtotal)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-emerald-700">
                  {order.discountTotal + order.couponDiscount > 0
                    ? `− ${formatCurrency(order.discountTotal + order.couponDiscount)}`
                    : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {order.shippingCharge === 0 ? "Free" : formatCurrency(order.shippingCharge)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatCurrency(order.taxAmount)}
                </TableCell>
                <TableCell className="font-semibold whitespace-nowrap text-slate-900">
                  {formatCurrency(order.total)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <PaymentStatusBadge status={order.paymentStatus} />
                    <span className="text-[11px] text-slate-500">
                      {PAYMENT_METHOD_LABELS[order.paymentMethod]}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={order.status} />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    aria-label={`Open ${order.orderNumber}`}
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
