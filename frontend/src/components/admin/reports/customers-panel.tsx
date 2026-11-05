"use client";

import { Repeat, UserPlus, UserRound, Wallet } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { EmptyState, Skeleton } from "@/components/admin/ui/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/admin/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { CustomerReport } from "@/types/report";

function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof UserRound;
}) {
  return (
    <Card className="min-w-0">
      <CardBody className="flex items-start gap-3">
        <span className="rounded-lg bg-slate-100 p-2 text-slate-600">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-1 truncate text-xl font-semibold text-slate-900">{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * The customer report: who bought, how many were new, and who buys the most.
 *
 * "New" means the customer's first ever order landed inside this window, so a
 * long-standing customer who ordered again does not inflate the number.
 */
export function CustomersPanel({
  report,
  loading,
  currency,
  locale,
}: {
  report: CustomerReport | null;
  loading: boolean;
  currency: string;
  locale: string;
}) {
  const money = (value: number) => formatCurrency(value, currency, locale);

  if (loading && !report) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((card) => (
            <Skeleton key={card} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-[320px] w-full" />
      </div>
    );
  }

  if (!report) {
    return (
      <EmptyState
        icon={UserRound}
        title="No customer report"
        description="Choose a date range to generate the customer report."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="New customers"
          value={report.summary.newCustomers.toLocaleString(locale)}
          hint="First order in this window"
          icon={UserPlus}
        />
        <Stat
          label="Repeat customers"
          value={report.summary.repeatCustomers.toLocaleString(locale)}
          hint={`${report.summary.repeatRate}% of ${report.summary.activeCustomers} active`}
          icon={Repeat}
        />
        <Stat
          label="Orders per customer"
          value={report.summary.ordersPerCustomer.toLocaleString(locale)}
          hint={`${report.range.label}`}
          icon={UserRound}
        />
        <Stat
          label="Average order value"
          value={money(report.summary.averageOrderValue)}
          hint="Non-cancelled orders"
          icon={Wallet}
        />
      </div>

      <Card className="min-w-0">
        <CardHeader
          title="Top customers"
          description="Ranked by spend in the selected window"
        />
        <CardBody className="p-0">
          {report.topCustomers.length === 0 ? (
            <EmptyState
              icon={UserRound}
              title="No customers ordered in this period"
              description="Widen the date range, or check that orders were placed."
              className="m-5 border-0"
            />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Customer</TableHeaderCell>
                  <TableHeaderCell className="text-right">Orders</TableHeaderCell>
                  <TableHeaderCell className="text-right">Spend</TableHeaderCell>
                  <TableHeaderCell className="text-right">Last order</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.topCustomers.map((customer) => (
                  <TableRow key={customer.id ?? customer.email}>
                    <TableCell>
                      <p className="font-medium text-slate-900">{customer.name}</p>
                      <p className="text-xs text-slate-500">{customer.email}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      {customer.orders.toLocaleString(locale)}
                    </TableCell>
                    <TableCell className="text-right">{money(customer.spend)}</TableCell>
                    <TableCell className="text-right text-slate-500">
                      {customer.lastOrderAt ? formatDate(customer.lastOrderAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
