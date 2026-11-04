"use client";

import {
  ArrowLeft,
  CreditCard,
  Package,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  User,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/admin/ui/badge";
import { Button } from "@/components/admin/ui/button";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState, ErrorState, Skeleton } from "@/components/admin/ui/states";
import { PaymentStatusBadge as OrderPaymentStatusBadge } from "@/components/admin/ui/badge";
import { usePaymentDetail } from "@/hooks/use-payment-list";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { RefundPaymentResult } from "@/types/payment";
import {
  GatewayTrustBadge,
  PaymentMethodLabel,
  RefundStatusBadge,
  TransactionStatusBadge,
} from "./payment-badges";
import { PaymentRefundDialog } from "./payment-refund-dialog";
import { PaymentTimeline } from "./payment-timeline";
import { GatewayReferenceRow } from "./payments-table";

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="space-y-3 p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-28" />
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 p-5 lg:col-span-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-24 w-full" />
        </Card>
        <Card className="space-y-3 p-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-24 w-full" />
        </Card>
      </div>
    </div>
  );
}

/**
 * Transaction detail.
 *
 * Shows what the gateway reported and what the store recorded, side by side:
 * amounts, references, refund history and an append-only timeline. Nothing here
 * can edit a status — the only action is a gateway refund.
 */
export function PaymentDetailView({ paymentId }: { paymentId: string }) {
  const { payment, error, loading, refresh, setPayment } = usePaymentDetail(paymentId);
  const [refundOpen, setRefundOpen] = useState(false);

  if (loading) {
    return <DetailSkeleton />;
  }

  if (error || !payment) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/payments"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All payments
        </Link>
        <ErrorState
          message={error ?? "This payment could not be loaded"}
          onRetry={refresh}
        />
      </div>
    );
  }

  const canRefund =
    (payment.status === "captured" || payment.status === "partially_refunded") &&
    payment.refundableAmount > 0 &&
    payment.gateway.paymentId !== null;
  const hasPendingRefund = payment.refunds.some((refund) => refund.status === "pending");

  const onRefunded = (result: RefundPaymentResult) => {
    setPayment((current) =>
      current
        ? {
            ...current,
            ...result.payment,
            refunds: [
              result.refund,
              ...current.refunds.filter(
                (refund) => refund.refundId !== result.refund.refundId,
              ),
            ],
            order: current.order,
            events: current.events,
            timeline: current.timeline,
          }
        : current,
    );
    refresh();
  };

  return (
    <div className="space-y-5">
      <Link
        href="/admin/payments"
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All payments
      </Link>

      <PageHeader
        title={`Payment ${payment.gateway.paymentId ?? payment.id.slice(0, 12)}`}
        description={`${payment.provider} · order ${payment.orderNumber}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={refresh}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh
            </Button>
            {canRefund ? (
              <Button
                variant="danger"
                onClick={() => setRefundOpen(true)}
                disabled={hasPendingRefund}
                title={
                  hasPendingRefund
                    ? "A refund is already pending on this order"
                    : undefined
                }
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Refund
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Amount</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatCurrency(payment.amount, payment.currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatCurrency(payment.refundedAmount, payment.currency)} refunded
            {payment.pendingRefundAmount > 0
              ? ` · ${formatCurrency(payment.pendingRefundAmount, payment.currency)} pending`
              : ""}
          </p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Payment status</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TransactionStatusBadge status={payment.status} />
            <GatewayTrustBadge
              verified={payment.gateway.verifiedWithGateway}
              signatureVerified={payment.gateway.signatureVerified}
            />
          </div>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            Set by the gateway only
          </p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Method</p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            <PaymentMethodLabel method={payment.method} />
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {payment.testMode ? "Razorpay test mode" : "Live"}
          </p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Payment date</p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {formatDateTime(payment.capturedAt ?? payment.createdAt)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {payment.capturedAt ? "Captured" : "Attempt created"}
          </p>
        </Card>
      </div>

      {payment.failureReason ? (
        <Card className="border-rose-200 bg-rose-50/60 p-4">
          <p className="text-xs font-semibold text-rose-800">Gateway reported a failure</p>
          <p className="mt-1 text-sm text-rose-700">{payment.failureReason}</p>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Order"
              description={`Fulfilment is tracked separately from payment`}
              action={
                <Link
                  href={`/admin/orders/${payment.order.id}`}
                  className="text-xs font-medium text-slate-600 underline-offset-2 hover:underline"
                >
                  Open order
                </Link>
              }
            />
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-slate-700">
                  {payment.order.orderNumber}
                </span>
                <Badge tone="info">{payment.order.statusLabel}</Badge>
                <OrderPaymentStatusBadge status={payment.order.paymentStatus} />
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Package className="h-4 w-4 text-slate-400" aria-hidden />
                {payment.order.items.length === 0
                  ? "No line items"
                  : `${payment.order.items.length} line${payment.order.items.length === 1 ? "" : "s"} · ${formatCurrency(payment.order.total, payment.order.currency)}`}
              </div>

              {payment.order.items.length > 0 ? (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {payment.order.items.map((item) => (
                    <li
                      key={`${item.sku}-${item.name}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate text-slate-700">
                        {item.quantity} × {item.name}
                      </span>
                      <span className="shrink-0 text-slate-900">
                        {formatCurrency(item.lineTotal, payment.order.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Refund history"
              description="Processed refunds are money returned; pending ones are obligations"
            />
            {payment.refunds.length === 0 ? (
              <EmptyState
                icon={RotateCcw}
                title="No refunds on this payment"
                description="A refund is recorded here only after the gateway executes it."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {payment.refunds.map((refund) => (
                  <li key={refund.refundId} className="px-5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">
                        {formatCurrency(refund.amount, payment.currency)}
                      </p>
                      <RefundStatusBadge status={refund.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{refund.reason}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {refund.source === "gateway" ? "Razorpay" : "Manual"}
                      {refund.gatewayRefundId ? ` · ${refund.gatewayRefundId}` : ""}
                      {" · requested "}
                      {formatDateTime(refund.requestedAt)}
                      {refund.processedAt
                        ? ` · processed ${formatDateTime(refund.processedAt)}`
                        : ""}
                    </p>
                    {refund.note ? (
                      <p className="mt-1 text-[11px] text-slate-500">{refund.note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Event timeline"
              description="Append-only: gateway webhooks, verifications and order money events"
            />
            <PaymentTimeline entries={payment.timeline} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Customer" />
            <CardBody className="space-y-1">
              <p className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900">
                <User className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                {payment.customer.name}
              </p>
              <p className="text-xs text-slate-600">{payment.customer.email}</p>
              {payment.order.customer.phone ? (
                <p className="text-xs text-slate-600">{payment.order.customer.phone}</p>
              ) : null}
              {payment.customer.userId ? (
                <Link
                  href={`/admin/customers/${payment.customer.userId}`}
                  className="mt-2 inline-block text-xs font-medium text-slate-600 underline-offset-2 hover:underline"
                >
                  Open customer
                </Link>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Gateway references"
              description="No card number, CVV or bank credential is ever stored"
            />
            <CardBody className="divide-y divide-slate-100">
              <GatewayReferenceRow label="Gateway order" value={payment.gateway.orderId} />
              <GatewayReferenceRow label="Gateway payment" value={payment.gateway.paymentId} />
              <GatewayReferenceRow
                label="Refunds"
                value={
                  payment.refunds.some((refund) => refund.gatewayRefundId)
                    ? payment.refunds
                        .map((refund) => refund.gatewayRefundId)
                        .filter(Boolean)
                        .join(", ")
                    : null
                }
              />
              <GatewayReferenceRow label="Internal id" value={payment.id} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Timestamps" />
            <CardBody className="divide-y divide-slate-100">
              <GatewayReferenceRow
                label="Created attempt"
                value={formatDateTime(payment.createdAt)}
              />
              <GatewayReferenceRow
                label="Captured"
                value={payment.capturedAt ? formatDateTime(payment.capturedAt) : null}
              />
              <GatewayReferenceRow
                label="Failed"
                value={payment.failedAt ? formatDateTime(payment.failedAt) : null}
              />
              <GatewayReferenceRow
                label="Last update"
                value={formatDateTime(payment.updatedAt)}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Raw events" description="What the server recorded" />
            {payment.events.length === 0 ? (
              <p className="px-5 py-4 text-xs text-slate-500">No gateway events yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {payment.events.map((event) => (
                  <li key={event.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-900">{event.label}</p>
                      <span className="text-[11px] text-slate-400">{event.source}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-600">{event.message}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {formatDateTime(event.at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {payment.status === "pending" || payment.status === "authorized" ? (
            <Card className="p-4">
              <p className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                <CreditCard className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                This attempt has not collected money. It changes only when the gateway
                confirms a capture.
              </p>
            </Card>
          ) : null}
        </div>
      </div>

      <PaymentRefundDialog
        open={refundOpen}
        payment={payment}
        onClose={() => setRefundOpen(false)}
        onRefunded={onRefunded}
      />
    </div>
  );
}
