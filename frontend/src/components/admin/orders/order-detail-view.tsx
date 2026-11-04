"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  CircleDollarSign,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Truck,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/admin/ui/badge";
import { Button } from "@/components/admin/ui/button";
import { Card, CardHeader } from "@/components/admin/ui/card";
import { PageHeader } from "@/components/admin/ui/page-header";
import { ErrorState, Skeleton } from "@/components/admin/ui/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/admin/ui/table";
import { useOrderDetail } from "@/hooks/use-order-list";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  SHIPPING_METHOD_LABELS,
} from "@/types/order";
import { OrderStatusBadge, PaymentStatusBadge } from "./order-badges";
import { OrderActionDialog, type OrderAction } from "./order-action-dialog";
import { OrderProgress, OrderTimeline } from "./order-timeline";
import { ReturnPanel } from "./return-panel";

export function OrderDetailView({ orderId }: { orderId: string }) {
  const { order, error, refresh, setOrder } = useOrderDetail(orderId);
  const [action, setAction] = useState<OrderAction | null>(null);

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState message={error} onRetry={refresh} />
      </div>
    );
  }

  if (!order) {
    return <OrderDetailSkeleton />;
  }

  const refundable = Math.max(
    0,
    order.payment.paidAmount - order.refundedAmount - order.pendingRefundAmount,
  );
  const canRecordPayment =
    order.paymentStatus === "pending" || order.paymentStatus === "failed";

  return (
    <div className="space-y-5">
      <BackLink />

      <PageHeader
        title={order.orderNumber}
        description={`Placed ${formatDateTime(order.createdAt)} · ${order.currency}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/orders/${order.id}/invoice`} target="_blank">
              <Button variant="secondary" size="sm">
                <FileText className="h-3.5 w-3.5" aria-hidden />
                Invoice
              </Button>
            </Link>

            {order.allowedNextStatuses.length > 0 ? (
              <Button size="sm" onClick={() => setAction({ type: "status" })}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Update status
              </Button>
            ) : null}

            {canRecordPayment ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setAction({ type: "payment" })}
              >
                <CircleDollarSign className="h-3.5 w-3.5" aria-hidden />
                Record payment
              </Button>
            ) : null}

            {order.status !== "cancelled" ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setAction({ type: "shipping" })}
              >
                <Truck className="h-3.5 w-3.5" aria-hidden />
                Shipping
              </Button>
            ) : null}

            {refundable > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setAction({ type: "refund" })}
              >
                Refund ₹{(refundable / 100).toLocaleString("en-IN")}
              </Button>
            ) : null}

            {order.canCancel ? (
              <Button
                size="sm"
                variant="danger"
                onClick={() => setAction({ type: "cancel" })}
              >
                <Ban className="h-3.5 w-3.5" aria-hidden />
                Cancel order
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <OrderStatusBadge status={order.status} />
        <PaymentStatusBadge status={order.paymentStatus} />
        <Badge tone="neutral">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</Badge>
        <Badge tone="neutral">{SHIPPING_METHOD_LABELS[order.shippingMethod]}</Badge>
        {order.activeReturn ? (
          <Badge tone="warning">Return in progress</Badge>
        ) : null}
      </div>

      <Card className="px-5 py-4">
        <OrderProgress order={order} />
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title="Items"
              description={`${order.itemCount} unit${order.itemCount === 1 ? "" : "s"} · prices captured at purchase`}
            />
            <Table className="min-w-full">
              <TableHead>
                <TableHeaderCell>Product</TableHeaderCell>
                <TableHeaderCell className="text-right">Qty</TableHeaderCell>
                <TableHeaderCell className="text-right">Unit price</TableHeaderCell>
                <TableHeaderCell className="text-right">Discount</TableHeaderCell>
                <TableHeaderCell className="text-right">Line total</TableHeaderCell>
              </TableHead>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.productId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {item.imageUrl ? (
                          // Snapshot URL: plain <img> because images may be served from
                          // any configured origin.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover"
                          />
                        ) : (
                          <span
                            className="h-10 w-10 shrink-0 rounded-lg bg-slate-100"
                            aria-hidden
                          />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-slate-800">
                            {item.name}
                          </p>
                          <p className="text-[11px] text-slate-500">{item.sku}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {formatCurrency(item.unitPrice)}
                      {item.listPrice > item.unitPrice ? (
                        <span className="ml-1 text-[11px] text-slate-400 line-through">
                          {formatCurrency(item.listPrice)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap text-emerald-700">
                      {item.discount > 0 ? `− ${formatCurrency(item.discount)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap text-slate-900">
                      {formatCurrency(item.lineTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <ReturnPanel order={order} onUpdated={setOrder} />

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Shipping address" />
              <div className="space-y-1 px-5 pb-5 text-xs text-slate-700">
                <p className="font-medium text-slate-900">
                  {order.shippingAddress.recipientName}
                </p>
                <p>{order.shippingAddress.phone}</p>
                <p>{order.shippingAddress.line1}</p>
                {order.shippingAddress.line2 ? <p>{order.shippingAddress.line2}</p> : null}
                <p>
                  {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
                  {order.shippingAddress.postalCode}
                </p>
                <p>{order.shippingAddress.country}</p>
                <p className="pt-1 text-[11px] text-slate-500">
                  {SHIPPING_METHOD_LABELS[order.shippingMethod]}
                </p>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Shipping & tracking"
                action={
                  order.status !== "cancelled" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAction({ type: "shipping" })}
                    >
                      Edit
                    </Button>
                  ) : null
                }
              />
              <div className="divide-y divide-slate-100 px-5 pb-4">
                <Row
                  label="Provider"
                  value={order.shipping?.provider ?? "Not assigned"}
                />
                <Row
                  label="Tracking number"
                  value={
                    order.shipping?.trackingUrl && order.shipping.trackingNumber ? (
                      <a
                        href={order.shipping.trackingUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-slate-900 underline"
                      >
                        {order.shipping.trackingNumber}
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : (
                      (order.shipping?.trackingNumber ?? "—")
                    )
                  }
                />
                <Row
                  label="Shipped on"
                  value={
                    order.shipping?.shippedAt
                      ? formatDateTime(order.shipping.shippedAt)
                      : "—"
                  }
                />
                <Row
                  label="Estimated delivery"
                  value={
                    order.shipping?.estimatedDelivery
                      ? formatDateTime(order.shipping.estimatedDelivery)
                      : "—"
                  }
                />
                <Row
                  label="Delivered on"
                  value={
                    order.shipping?.deliveredAt
                      ? formatDateTime(order.shipping.deliveredAt)
                      : "—"
                  }
                />
                {order.shipping?.notes.length ? (
                  <div className="py-2">
                    <p className="text-[11px] tracking-wide text-slate-500 uppercase">
                      Notes
                    </p>
                    <ul className="mt-1 space-y-1">
                      {order.shipping.notes.map((note, index) => (
                        <li key={`${note.at}-${index}`} className="text-xs text-slate-700">
                          {note.note}
                          <span className="ml-1 text-[11px] text-slate-400">
                            {formatDateTime(note.at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Timeline"
              description="Append-only record — who changed what, when and why."
            />
            <div className="px-5 pb-5">
              <OrderTimeline entries={order.history} />
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Customer" />
            <div className="divide-y divide-slate-100 px-5 pb-4">
              <Row label="Name" value={order.customerName} />
              <Row label="Email" value={order.customerEmail} />
              <Row label="Phone" value={order.customerPhone ?? "—"} />
              <Row
                label="Account"
                value={order.userId ? "Registered customer" : "Guest checkout"}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Payment" />
            <div className="divide-y divide-slate-100 px-5 pb-4">
              <Row label="Method" value={PAYMENT_METHOD_LABELS[order.payment.method]} />
              <Row label="Status" value={PAYMENT_STATUS_LABELS[order.paymentStatus]} />
              <Row
                label="Transaction"
                value={order.payment.transactionId ?? "—"}
              />
              <Row label="Paid" value={formatCurrency(order.payment.paidAmount)} />
              <Row
                label="Paid on"
                value={
                  order.payment.paidAt ? formatDateTime(order.payment.paidAt) : "—"
                }
              />
              <Row label="Refunded" value={formatCurrency(order.refundedAmount)} />
              {order.pendingRefundAmount > 0 ? (
                <Row
                  label="Refund queued"
                  value={formatCurrency(order.pendingRefundAmount)}
                />
              ) : null}
              <Row label="Balance due" value={formatCurrency(order.balanceDue)} />
            </div>

            {order.payment.refunds.length > 0 ? (
              <ul className="space-y-2 border-t border-slate-100 px-5 py-3">
                {order.payment.refunds.map((refund) => (
                  <li
                    key={refund.refundId}
                    className="rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-800">
                        {formatCurrency(refund.amount)}
                      </span>
                      <Badge
                        tone={
                          refund.status === "processed"
                            ? "success"
                            : refund.status === "failed"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {refund.status === "processed"
                          ? "Refunded"
                          : refund.status === "failed"
                            ? "Failed"
                            : "Queued"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600">{refund.reason}</p>
                    <p className="text-[11px] text-slate-400">
                      {formatDateTime(refund.requestedAt)}
                      {refund.reference ? ` · ${refund.reference}` : ""}
                    </p>
                    {refund.status === "pending" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-2"
                        onClick={() =>
                          setAction({
                            type: "refund-decision",
                            refundId: refund.refundId,
                            amount: refund.amount,
                            reason: refund.reason,
                          })
                        }
                      >
                        Mark as refunded
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Pricing" />
            <div className="divide-y divide-slate-100 px-5 pb-4">
              <Row label="Subtotal" value={formatCurrency(order.subtotal)} />
              {order.discountTotal > 0 ? (
                <Row
                  label="Product discounts"
                  value={`− ${formatCurrency(order.discountTotal)}`}
                />
              ) : null}
              {order.couponDiscount > 0 ? (
                <Row
                  label={`Coupon${order.couponCode ? ` (${order.couponCode})` : ""}`}
                  value={`− ${formatCurrency(order.couponDiscount)}`}
                />
              ) : null}
              <Row
                label="Shipping"
                value={
                  order.shippingCharge === 0
                    ? "Free"
                    : formatCurrency(order.shippingCharge)
                }
              />
              <Row
                label={`Tax${order.taxRatePercent > 0 ? ` (${order.taxRatePercent}%)` : ""}`}
                value={formatCurrency(order.taxAmount)}
              />
              <Row
                label="Grand total"
                value={
                  <span className="text-sm text-slate-900">{formatCurrency(order.total)}</span>
                }
              />
            </div>
          </Card>

          {order.cancellation ? (
            <Card>
              <CardHeader title="Cancellation" />
              <div className="divide-y divide-slate-100 px-5 pb-4">
                <Row label="Reason" value={order.cancellation.reason} />
                <Row
                  label="Cancelled on"
                  value={formatDateTime(order.cancellation.cancelledAt)}
                />
                <Row
                  label="By"
                  value={order.cancellation.cancelledBy?.email ?? "system"}
                />
                <Row
                  label="Stock"
                  value={
                    order.cancellation.restocked ? (
                      <Badge tone="success">Restored</Badge>
                    ) : (
                      <Badge tone="warning">Not restored</Badge>
                    )
                  }
                />
                {order.cancellation.note ? (
                  <Row label="Note" value={order.cancellation.note} />
                ) : null}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Order info" />
            <div className="divide-y divide-slate-100 px-5 pb-4">
              <Row label="Order number" value={order.orderNumber} />
              <Row label="Created" value={formatDateTime(order.createdAt)} />
              <Row label="Updated" value={formatDateTime(order.updatedAt)} />
              <Row
                label="Closed"
                value={order.closedAt ? formatDateTime(order.closedAt) : "—"}
              />
            </div>
          </Card>
        </div>
      </div>

      <OrderActionDialog
        order={order}
        action={action}
        onClose={() => setAction(null)}
        onDone={setOrder}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/orders"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      All orders
    </Link>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[60%] text-right font-medium break-words text-slate-800">
        {value}
      </span>
    </div>
  );
}

function OrderDetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-9 w-full" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <Card className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </Card>
          <Card className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
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
      <Loader2 className="h-4 w-4 animate-spin text-slate-300" aria-hidden />
    </div>
  );
}
