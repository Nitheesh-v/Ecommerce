"use client";

import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  MapPin,
  PackageCheck,
  RefreshCw,
  Truck,
  User,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Badge, OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/ui/badge";
import { Button } from "@/components/admin/ui/button";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { PageHeader } from "@/components/admin/ui/page-header";
import { ErrorState, Skeleton } from "@/components/admin/ui/states";
import { useShipmentDetail } from "@/hooks/use-shipment-list";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import type { ShipmentDetail } from "@/types/shipment";
import { isTerminalShipment, SHIPMENT_STATUS_LABELS } from "@/types/shipment";
import { ShipmentStatusBadge } from "./shipment-badges";
import { ShipmentCourierDialog } from "./shipment-courier-dialog";
import { ShipmentStatusDialog } from "./shipment-status-dialog";
import { ShipmentTimeline } from "./shipment-timeline";

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

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-xs font-medium text-slate-800">{value}</dd>
    </div>
  );
}

/**
 * Shipment detail.
 *
 * The two actions are validated transitions (`PATCH .../status`) and a courier
 * correction (`PATCH .../courier`). The page never changes anything on load: an
 * order is not delivered because someone looked at it.
 */
export function ShipmentDetailView({ shipmentId }: { shipmentId: string }) {
  const { shipment, error, loading, refresh, setShipment } =
    useShipmentDetail(shipmentId);
  const [statusOpen, setStatusOpen] = useState(false);
  const [courierOpen, setCourierOpen] = useState(false);

  if (loading) {
    return <DetailSkeleton />;
  }

  if (error || !shipment) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/shipping"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All shipments
        </Link>
        <ErrorState
          message={error ?? "This shipment could not be loaded"}
          onRetry={refresh}
        />
      </div>
    );
  }

  const onUpdated = (updated: ShipmentDetail) => {
    setShipment(updated);
    refresh();
  };

  const closed = isTerminalShipment(shipment.status);

  return (
    <div className="space-y-5">
      <PageHeader
        title={shipment.shipmentNumber}
        description={`Order ${shipment.orderNumber} · ${shipment.customer.name}`}
        actions={
          <>
            <Button variant="secondary" onClick={refresh}>
              <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
              Refresh
            </Button>
            <Button
              variant="secondary"
              onClick={() => setCourierOpen(true)}
              disabled={closed}
              title={
                closed
                  ? "The courier is fixed once delivery is finalised"
                  : "Assign or correct the courier"
              }
            >
              <Truck className="mr-1.5 h-4 w-4" aria-hidden />
              Courier
            </Button>
            <Button
              onClick={() => setStatusOpen(true)}
              disabled={closed}
              title={closed ? "This shipment is closed" : "Move the parcel forward"}
            >
              <PackageCheck className="mr-1.5 h-4 w-4" aria-hidden />
              Update status
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ShipmentStatusBadge status={shipment.status} delayed={shipment.delayed} />
        <OrderStatusBadge status={shipment.order.status} />
        <PaymentStatusBadge status={shipment.order.paymentStatus} />
        <Link
          href={`/admin/orders/${shipment.orderId}`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
        >
          Open order
          <ExternalLink className="h-3 w-3" aria-hidden />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500">Delivery status</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {SHIPMENT_STATUS_LABELS[shipment.status]}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {shipment.delayed
              ? "Past the promised date"
              : shipment.actualDelivery
                ? `Delivered ${formatDate(shipment.actualDelivery)}`
                : "Not delivered yet"}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500">Courier</p>
          <p className="mt-1 truncate text-lg font-semibold text-slate-900">
            {shipment.courier.name}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {shipment.courier.automated ? "API integration" : "Manual workflow"}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500">Tracking number</p>
          <p className="mt-1 truncate font-mono text-sm font-semibold text-slate-900">
            {shipment.courier.trackingNumber ?? "Not assigned"}
          </p>
          {shipment.courier.trackingUrl ? (
            <a
              href={shipment.courier.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-700 hover:underline"
            >
              Track with the courier
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : (
            <p className="mt-1 text-[11px] text-slate-400">No tracking link</p>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500">Shipping cost</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {formatCurrency(shipment.shippingCost, shipment.order.currency)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {shipment.weightGrams
              ? `${shipment.weightGrams} g`
              : "Weight not recorded"}
            {shipment.dimensions
              ? ` · ${shipment.dimensions.lengthCm}×${shipment.dimensions.widthCm}×${shipment.dimensions.heightCm} cm`
              : ""}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Delivery history"
              description="Append-only: each entry records who changed what, and why."
            />
            <CardBody className="p-0">
              <ShipmentTimeline events={shipment.events} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Order contents"
              description={`${shipment.order.itemCount} item${shipment.order.itemCount === 1 ? "" : "s"} · ${formatCurrency(shipment.order.total, shipment.order.currency)}`}
            />
            <CardBody className="space-y-2">
              {shipment.order.items.length === 0 ? (
                <p className="text-sm text-slate-500">This order has no items recorded.</p>
              ) : (
                shipment.order.items.map((item) => (
                  <div
                    key={`${item.sku}-${item.name}`}
                    className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {item.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.sku} · ×{item.quantity}
                      </p>
                    </div>
                    <p className="text-sm text-slate-700">
                      {formatCurrency(item.lineTotal, shipment.order.currency)}
                    </p>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Shipping address" />
            <CardBody>
              <div className="flex gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <address className="text-sm leading-relaxed text-slate-700 not-italic">
                  <span className="font-medium text-slate-900">
                    {shipment.address.recipientName}
                  </span>
                  <br />
                  {shipment.address.line1}
                  {shipment.address.line2 ? (
                    <>
                      <br />
                      {shipment.address.line2}
                    </>
                  ) : null}
                  <br />
                  {shipment.address.city}, {shipment.address.state}{" "}
                  {shipment.address.postalCode}
                  <br />
                  {shipment.address.country}
                  <br />
                  <span className="text-xs text-slate-500">{shipment.address.phone}</span>
                </address>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                Copied from the checkout address snapshot and not editable here.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <CardBody className="space-y-1">
              <p className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                <User className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                {shipment.customer.name}
              </p>
              <p className="text-xs text-slate-500">{shipment.customer.email}</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Dates" />
            <CardBody>
              <dl className="divide-y divide-slate-100">
                <Row label="Created" value={formatDateTime(shipment.createdAt)} />
                <Row
                  label="Shipped"
                  value={shipment.shippedAt ? formatDateTime(shipment.shippedAt) : "—"}
                />
                <Row
                  label="Expected"
                  value={
                    shipment.estimatedDelivery ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3 text-slate-400" aria-hidden />
                        {formatDate(shipment.estimatedDelivery)}
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
                <Row
                  label="Delivered"
                  value={
                    shipment.actualDelivery ? formatDateTime(shipment.actualDelivery) : "—"
                  }
                />
                <Row
                  label="Last update"
                  value={`${formatDateTime(shipment.updatedAt)}${
                    shipment.updatedBy ? ` · ${shipment.updatedBy}` : ""
                  }`}
                />
                <Row label="Created by" value={shipment.createdBy ?? "—"} />
              </dl>
            </CardBody>
          </Card>

          {shipment.failureReason ? (
            <Card>
              <CardHeader title="Failure reason" />
              <CardBody>
                <p className="text-sm text-rose-700">{shipment.failureReason}</p>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Internal notes"
              description="Never shown to the customer."
            />
            <CardBody>
              {shipment.notes ? (
                <p className="text-sm whitespace-pre-line text-slate-700">
                  {shipment.notes}
                </p>
              ) : (
                <p className="text-sm text-slate-500">No notes recorded.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payment" />
            <CardBody>
              <div className="flex flex-wrap items-center gap-2">
                <PaymentStatusBadge status={shipment.order.paymentStatus} />
                <Badge tone="neutral">
                  {formatCurrency(shipment.order.total, shipment.order.currency)}
                </Badge>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                Shipment and order movements never change the payment status.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {statusOpen ? (
        <ShipmentStatusDialog
          open
          shipment={shipment}
          onClose={() => setStatusOpen(false)}
          onUpdated={onUpdated}
        />
      ) : null}

      {courierOpen ? (
        <ShipmentCourierDialog
          open
          shipment={shipment}
          onClose={() => setCourierOpen(false)}
          onUpdated={onUpdated}
        />
      ) : null}
    </div>
  );
}
