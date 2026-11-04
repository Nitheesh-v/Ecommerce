"use client";

import Link from "next/link";
import { ArrowLeft, MapPin, ShieldCheck, UserCog } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/admin/ui/badge";
import { Button } from "@/components/admin/ui/button";
import { Card, CardHeader } from "@/components/admin/ui/card";
import { PageHeader } from "@/components/admin/ui/page-header";
import { ErrorState, Skeleton } from "@/components/admin/ui/states";
import { useCustomerDetail } from "@/hooks/use-customer-list";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { CUSTOMER_STATUS_LABELS } from "@/types/customer";
import { CustomerAvatar, CustomerStatusBadge } from "./customer-badges";
import { CustomerOrdersTable } from "./customer-orders-table";
import { CustomerStatusDialog } from "./customer-status-dialog";

export function CustomerDetailView({ customerId }: { customerId: string }) {
  const { customer, error, loading, refresh, setCustomer } = useCustomerDetail(customerId);
  const [statusOpen, setStatusOpen] = useState(false);

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState message={error} onRetry={refresh} />
      </div>
    );
  }

  if (loading || !customer) {
    return <CustomerDetailSkeleton />;
  }

  const { metrics } = customer;
  const isRepeat = metrics.successfulOrders >= 2;

  return (
    <div className="space-y-5">
      <BackLink />

      <PageHeader
        title={customer.fullName}
        description={`${customer.email} · joined ${formatDate(customer.createdAt)}`}
        actions={
          <Button size="sm" variant="secondary" onClick={() => setStatusOpen(true)}>
            <UserCog className="h-3.5 w-3.5" aria-hidden />
            Change status
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <CustomerStatusBadge status={customer.status} />
        {isRepeat ? (
          <Badge tone="accent">Repeat customer</Badge>
        ) : metrics.successfulOrders === 1 ? (
          <Badge tone="info">First-time buyer</Badge>
        ) : (
          <Badge tone="neutral">No purchases yet</Badge>
        )}
        {metrics.pendingRefundAmount > 0 ? (
          <Badge tone="warning">
            {formatCurrency(metrics.pendingRefundAmount)} refund pending
          </Badge>
        ) : null}
        <span className="text-[11px] text-slate-400">Customer #{customer.id.slice(-8)}</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title="Order summary"
              description="Spending counts paid orders only, net of processed refunds."
            />
            <dl className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-3">
              <Metric label="Total orders" value={String(metrics.totalOrders)} />
              <Metric
                label="Successful purchases"
                value={String(metrics.successfulOrders)}
                hint="Paid and not cancelled/returned"
              />
              <Metric label="Total spending" value={formatCurrency(metrics.totalSpent)} />
              <Metric
                label="Average order value"
                value={formatCurrency(metrics.averageOrderValue)}
              />
              <Metric
                label="Last order"
                value={metrics.lastOrderAt ? formatDate(metrics.lastOrderAt) : "—"}
              />
              <Metric
                label="Refunded"
                value={formatCurrency(metrics.refundedAmount)}
                hint={
                  metrics.pendingRefundAmount > 0
                    ? `${formatCurrency(metrics.pendingRefundAmount)} still pending`
                    : "Processed refunds"
                }
              />
            </dl>
          </Card>

          <CustomerOrdersTable customerId={customer.id} />

          <Card>
            <CardHeader title="Activity" description="Account events, newest first." />
            <ol className="space-y-3 px-5 py-4">
              {customer.activity.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    {entry.kind === "account_created" ? (
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <UserCog className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-800">{entry.label}</p>
                    {entry.detail ? (
                      <p className="mt-0.5 text-xs text-slate-600">{entry.detail}</p>
                    ) : null}
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {formatDateTime(entry.at)}
                      {entry.by ? ` · ${entry.by}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Personal information" />
            <div className="px-5 pt-4">
              <div className="flex items-center gap-3">
                <CustomerAvatar
                  name={customer.fullName}
                  imageUrl={customer.avatarUrl}
                  size="lg"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {customer.fullName}
                  </p>
                  <p className="truncate text-xs text-slate-500">{customer.email}</p>
                </div>
              </div>
            </div>
            <div className="divide-y divide-slate-100 px-5 pb-4">
              <Row label="Phone" value={customer.phone ?? "—"} />
              <Row label="Status" value={CUSTOMER_STATUS_LABELS[customer.status]} />
              <Row label="Registered" value={formatDateTime(customer.createdAt)} />
              <Row label="Last updated" value={formatDateTime(customer.updatedAt)} />
              <Row label="Customer ID" value={<span className="font-mono text-[11px]">{customer.id}</span>} />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Addresses"
              description="Captured from this customer's orders."
            />
            {customer.addresses.length === 0 ? (
              <p className="px-5 py-4 text-xs text-slate-500">
                No shipping address on record yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {customer.addresses.map((address, index) => (
                  <li key={`${address.line1}-${index}`} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-800">
                        {address.recipientName}
                      </p>
                      {index === 0 ? <Badge tone="info">Most recent</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{address.phone}</p>
                    <p className="mt-1 flex items-start gap-1 text-xs text-slate-600">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden />
                      <span>
                        {address.line1}
                        {address.line2 ? `, ${address.line2}` : ""}, {address.city},{" "}
                        {address.state} {address.postalCode}, {address.country}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Last used {formatDate(address.lastUsedAt)} · {address.orderNumber}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Status history" description="Who changed what, and why." />
            {customer.statusHistory.length === 0 ? (
              <p className="px-5 py-4 text-xs text-slate-500">
                No status changes recorded.
              </p>
            ) : (
              <ol className="space-y-3 px-5 py-4">
                {[...customer.statusHistory].reverse().map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="text-xs">
                    <p className="font-medium text-slate-800">
                      {entry.fromLabel} → {entry.toLabel}
                    </p>
                    {entry.reason ? (
                      <p className="mt-0.5 text-slate-600">{entry.reason}</p>
                    ) : null}
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {formatDateTime(entry.at)}
                      {entry.by ? ` · ${entry.by}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <CustomerStatusDialog
        customer={customer}
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        onDone={setCustomer}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-slate-900">{value}</dd>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[62%] text-right font-medium break-words text-slate-800">
        {value}
      </span>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/customers"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      All customers
    </Link>
  );
}

function CustomerDetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-56" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <Card className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </Card>
          <Card className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-2/3" />
            ))}
          </Card>
        </div>
        <div className="space-y-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((__, row) => (
                <Skeleton key={row} className="h-3 w-full" />
              ))}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
