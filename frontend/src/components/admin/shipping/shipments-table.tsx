"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Eye } from "lucide-react";
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
import { formatDate } from "@/lib/utils";
import type { Shipment, ShipmentSortField } from "@/types/shipment";
import { CourierLabel, ShipmentStatusBadge, TrackingNumber } from "./shipment-badges";

function SortHeader({
  label,
  field,
  activeField,
  direction,
  onSort,
}: {
  label: string;
  field: ShipmentSortField;
  activeField: ShipmentSortField;
  direction: "asc" | "desc";
  onSort: (field: ShipmentSortField) => void;
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

/**
 * Shipment table.
 *
 * There is no inline status control: every status change goes through the detail
 * dialog, where the state machine and the mandatory failure reason are enforced.
 */
export function ShipmentsTable({
  shipments,
  loading,
  sortBy,
  sortOrder,
  onSort,
}: {
  shipments: Shipment[];
  loading: boolean;
  sortBy: ShipmentSortField;
  sortOrder: "asc" | "desc";
  onSort: (field: ShipmentSortField) => void;
}) {
  return (
    <Table className="min-w-[72rem]">
      <TableHead>
        <TableHeaderCell>Shipment ID</TableHeaderCell>
        <TableHeaderCell>Order ID</TableHeaderCell>
        <TableHeaderCell>Customer</TableHeaderCell>
        <TableHeaderCell>Courier partner</TableHeaderCell>
        <TableHeaderCell>Tracking number</TableHeaderCell>
        <SortHeader
          label="Shipping date"
          field="createdAt"
          activeField={sortBy}
          direction={sortOrder}
          onSort={onSort}
        />
        <SortHeader
          label="Expected delivery"
          field="estimatedDelivery"
          activeField={sortBy}
          direction={sortOrder}
          onSort={onSort}
        />
        <SortHeader
          label="Delivery status"
          field="status"
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
                {Array.from({ length: 9 }).map((__, cell) => (
                  <TableCell key={cell}>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          : shipments.map((shipment) => (
              <TableRow key={shipment.id}>
                <TableCell>
                  <Link
                    href={`/admin/shipping/${shipment.id}`}
                    className="font-mono text-xs font-medium text-slate-900 underline-offset-2 hover:underline"
                  >
                    {shipment.shipmentNumber}
                  </Link>
                  {shipment.actualDelivery ? (
                    <p className="mt-0.5 text-[11px] text-emerald-700">
                      Delivered {formatDate(shipment.actualDelivery)}
                    </p>
                  ) : null}
                </TableCell>

                <TableCell>
                  <Link
                    href={`/admin/orders/${shipment.orderId}`}
                    className="font-mono text-xs text-slate-700 underline-offset-2 hover:underline"
                  >
                    {shipment.orderNumber}
                  </Link>
                </TableCell>

                <TableCell>
                  <p className="font-medium text-slate-900">{shipment.customer.name}</p>
                  <p className="text-xs text-slate-500">{shipment.customer.email}</p>
                </TableCell>

                <TableCell className="max-w-[12rem]">
                  <CourierLabel
                    name={shipment.courier.name}
                    automated={shipment.courier.automated}
                  />
                </TableCell>

                <TableCell className="max-w-[12rem]">
                  <TrackingNumber
                    trackingNumber={shipment.courier.trackingNumber}
                    trackingUrl={shipment.courier.trackingUrl}
                  />
                  {shipment.shippingCost > 0 ? (
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Cost ₹{(shipment.shippingCost / 100).toFixed(2)}
                    </p>
                  ) : null}
                </TableCell>

                <TableCell>
                  <span className="text-xs text-slate-600">
                    {formatDate(shipment.createdAt)}
                  </span>
                </TableCell>

                <TableCell>
                  {shipment.estimatedDelivery ? (
                    <span className="text-xs text-slate-600">
                      {formatDate(shipment.estimatedDelivery)}
                    </span>
                  ) : (
                    <Badge tone="neutral">Not promised</Badge>
                  )}
                </TableCell>

                <TableCell>
                  <ShipmentStatusBadge
                    status={shipment.status}
                    delayed={shipment.delayed}
                  />
                  {shipment.failureReason ? (
                    <p className="mt-1 line-clamp-2 max-w-[14rem] text-[11px] text-rose-600">
                      {shipment.failureReason}
                    </p>
                  ) : null}
                </TableCell>

                <TableCell className="text-right">
                  <Link href={`/admin/shipping/${shipment.id}`}>
                    <Button variant="secondary" size="sm">
                      <Eye className="mr-1 h-3.5 w-3.5" aria-hidden />
                      View
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
      </TableBody>
    </Table>
  );
}
