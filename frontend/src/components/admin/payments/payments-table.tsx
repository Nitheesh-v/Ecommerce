"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Eye, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/admin/ui/badge";
import { Button } from "@/components/admin/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/admin/ui/table";
import { Skeleton } from "@/components/admin/ui/states";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { Payment, PaymentSortField } from "@/types/payment";
import { PaymentMethodLabel, TransactionStatusBadge } from "./payment-badges";

/** Transaction ids are long; the row shows a readable prefix, the full id on hover. */
function shortId(value: string | null, fallback: string) {
  const id = value ?? fallback;

  return id.length > 18 ? `${id.slice(0, 14)}…` : id;
}

function SortHeader({
  label,
  field,
  activeField,
  direction,
  onSort,
}: {
  label: string;
  field: PaymentSortField;
  activeField: PaymentSortField;
  direction: "asc" | "desc";
  onSort: (field: PaymentSortField) => void;
}) {
  const active = activeField === field;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHeaderCell>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase transition-colors hover:text-slate-800"
      >
        {label}
        <Icon className="h-3 w-3" aria-hidden />
      </button>
    </TableHeaderCell>
  );
}

export function PaymentsTable({
  payments,
  loading,
  sortBy,
  sortOrder,
  onSort,
}: {
  payments: Payment[];
  loading: boolean;
  sortBy: PaymentSortField;
  sortOrder: "asc" | "desc";
  onSort: (field: PaymentSortField) => void;
}) {
  return (
    <Table className="min-w-[64rem]">
      <TableHead>
        <TableHeaderCell>Transaction ID</TableHeaderCell>
        <TableHeaderCell>Order ID</TableHeaderCell>
        <TableHeaderCell>Customer</TableHeaderCell>
        <TableHeaderCell>Method</TableHeaderCell>
        <SortHeader
          label="Amount"
          field="amount"
          activeField={sortBy}
          direction={sortOrder}
          onSort={onSort}
        />
        <TableHeaderCell>Status</TableHeaderCell>
        <SortHeader
          label="Payment date"
          field="createdAt"
          activeField={sortBy}
          direction={sortOrder}
          onSort={onSort}
        />
        <TableHeaderCell className="text-right">Actions</TableHeaderCell>
      </TableHead>

      <TableBody>
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <TableRow key={`skeleton-${index}`}>
                {Array.from({ length: 8 }).map((__, cell) => (
                  <TableCell key={cell}>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          : payments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell>
                  <Link
                    href={`/admin/payments/${payment.id}`}
                    className="font-mono text-xs font-medium text-slate-900 underline-offset-2 hover:underline"
                    title={payment.gateway.paymentId ?? payment.id}
                  >
                    {shortId(payment.gateway.paymentId, payment.id)}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {payment.gateway.orderId ? "gateway" : "local"} · {payment.provider}
                  </p>
                </TableCell>

                <TableCell>
                  <span className="font-mono text-xs text-slate-700">
                    {payment.orderNumber}
                  </span>
                </TableCell>

                <TableCell>
                  <p className="font-medium text-slate-900">{payment.customer.name}</p>
                  <p className="text-xs text-slate-500">{payment.customer.email}</p>
                </TableCell>

                <TableCell>
                  <PaymentMethodLabel method={payment.method} />
                </TableCell>

                <TableCell>
                  <p className="font-medium text-slate-900">
                    {formatCurrency(payment.amount, payment.currency)}
                  </p>
                  {payment.refundedAmount > 0 ? (
                    <p className="text-[11px] text-indigo-600">
                      −{formatCurrency(payment.refundedAmount, payment.currency)} refunded
                    </p>
                  ) : null}
                </TableCell>

                <TableCell>
                  <TransactionStatusBadge status={payment.status} />
                  {payment.testMode ? (
                    <p className="mt-1 text-[11px] text-amber-600">Test mode</p>
                  ) : null}
                </TableCell>

                <TableCell>
                  <p className="text-sm text-slate-700">
                    {formatDateTime(payment.capturedAt ?? payment.createdAt)}
                  </p>
                  {payment.capturedAt === null ? (
                    <p className="text-[11px] text-slate-400">not captured</p>
                  ) : null}
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`/admin/payments/${payment.id}`}>
                      <Button variant="ghost" size="sm" aria-label="View transaction">
                        <Eye className="h-4 w-4" aria-hidden />
                        View
                      </Button>
                    </Link>
                    {payment.refundableAmount > 0 &&
                    (payment.status === "captured" ||
                      payment.status === "partially_refunded") ? (
                      <Link href={`/admin/payments/${payment.id}`}>
                        <Button variant="secondary" size="sm" aria-label="Refund transaction">
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                          Refund
                        </Button>
                      </Link>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
      </TableBody>
    </Table>
  );
}

/** Small helper used by the detail header for the transaction reference chip. */
export function GatewayReferenceRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      {value ? (
        <span className="font-mono text-xs break-all text-slate-800">{value}</span>
      ) : (
        <Badge tone="neutral">—</Badge>
      )}
    </div>
  );
}
