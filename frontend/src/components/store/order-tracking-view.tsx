"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ExternalLink,
  Lock,
  PackageSearch,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { Skeleton } from "@/components/admin/ui/states";
import { getApiErrorStatus, getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { trackingService } from "@/services/store/tracking.service";
import type { OrderTracking } from "@/types/shipment";

interface LoadState {
  key: string;
  tracking: OrderTracking | null;
  error: string | null;
  status?: number;
}

/**
 * Customer order tracking.
 *
 * Read-only, and nothing on this page can move a parcel: opening it never marks
 * anything delivered. The API decides ownership, so the page only renders what it
 * is allowed to see — and a foreign order is indistinguishable from a missing one.
 */
export function OrderTrackingView({ orderId }: { orderId: string }) {
  const [state, setState] = useState<LoadState>({ key: "", tracking: null, error: null });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    trackingService
      .get(orderId, controller.signal)
      .then((tracking) => {
        if (active) {
          setState({ key: orderId, tracking, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) {
          return;
        }

        setState({
          key: orderId,
          tracking: null,
          error: getApiErrorMessage(error),
          status: getApiErrorStatus(error),
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [orderId, reloadToken]);

  const loading = state.key !== orderId && !state.error;

  return (
    <div className="space-y-5">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Continue shopping
      </Link>

      {loading ? (
        <div className="space-y-4">
          <Card className="space-y-3 p-6">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-52" />
          </Card>
          <Card className="space-y-3 p-6">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-24 w-full" />
          </Card>
        </div>
      ) : state.error ? (
        <TrackingError
          message={state.error}
          status={state.status}
          onRetry={() => {
            setState({ key: "", tracking: null, error: null });
            setReloadToken((token) => token + 1);
          }}
        />
      ) : state.tracking ? (
        <TrackingBody tracking={state.tracking} />
      ) : null}
    </div>
  );
}

function TrackingError({
  message,
  status,
  onRetry,
}: {
  message: string;
  status?: number;
  onRetry: () => void;
}) {
  const unauthenticated = status === 401 || status === 403;
  const missing = status === 404;

  return (
    <Card className="p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        {unauthenticated ? (
          <Lock className="h-5 w-5" aria-hidden />
        ) : (
          <PackageSearch className="h-5 w-5" aria-hidden />
        )}
      </span>
      <h1 className="mt-3 text-base font-semibold text-slate-900">
        {unauthenticated
          ? "Sign in to track this order"
          : missing
            ? "This order has no tracking yet"
            : "Tracking is unavailable right now"}
      </h1>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        {unauthenticated
          ? "Order tracking is private to the account that placed the order. Sign in with that account and open the link again."
          : missing
            ? "Only the account that placed an order can see its tracking, and a shipment appears here once the store has packed and dispatched it."
            : message}
      </p>
      {missing ? null : (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

function TrackingBody({ tracking }: { tracking: OrderTracking }) {
  const failed =
    tracking.status === "delivery_failed" || tracking.status === "returned_to_sender";

  return (
    <>
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">
                Order {tracking.orderNumber}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                {tracking.statusLabel}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Shipment{" "}
                <span className="font-mono text-xs text-slate-700">
                  {tracking.shipmentNumber}
                </span>
              </p>
            </div>

            <div className="text-right">
              <p className="text-xs font-medium text-slate-500">
                {tracking.actualDelivery
                  ? "Delivered"
                  : tracking.estimatedDelivery
                    ? "Expected"
                    : "Delivery date"}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {tracking.actualDelivery
                  ? formatDate(tracking.actualDelivery)
                  : tracking.estimatedDelivery
                    ? formatDate(tracking.estimatedDelivery)
                    : "Not scheduled yet"}
              </p>
            </div>
          </div>

          {failed && tracking.failureReason ? (
            <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {tracking.failureReason}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-slate-100 pt-4 text-sm">
            <span className="inline-flex items-center gap-1.5 text-slate-700">
              <Truck className="h-4 w-4 text-slate-400" aria-hidden />
              {tracking.courier.name}
            </span>

            {tracking.courier.trackingNumber ? (
              <span className="text-slate-700">
                Tracking number{" "}
                {tracking.courier.trackingUrl ? (
                  <a
                    href={tracking.courier.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs font-medium text-sky-700 underline-offset-2 hover:underline"
                  >
                    {tracking.courier.trackingNumber}
                  </a>
                ) : (
                  <span className="font-mono text-xs">
                    {tracking.courier.trackingNumber}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                The store has not assigned a tracking number yet
              </span>
            )}

            {tracking.courier.trackingUrl ? (
              <a
                href={tracking.courier.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline"
              >
                Track on the courier site
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Progress" description="Updates appear as the courier scans the parcel." />
        <CardBody>
          <ol className="grid gap-3 sm:grid-cols-6">
            {tracking.steps.map((step) => (
              <li key={step.status} className="flex items-start gap-2 sm:flex-col">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    step.reached
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-400",
                  )}
                >
                  {step.reached ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <span aria-hidden>•</span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    step.reached ? "font-medium text-slate-800" : "text-slate-400",
                  )}
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Tracking updates" />
        <CardBody className="p-0">
          {tracking.events.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">
              No updates yet — they appear here as soon as the parcel moves.
            </p>
          ) : (
            <ol className="space-y-4 px-5 py-4">
              {tracking.events.map((event, index) => (
                <li key={`${event.at}-${index}`} className="flex gap-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                  <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm text-slate-800">{event.label}</p>
                    <time
                      className="text-xs text-slate-500"
                      dateTime={event.at}
                      title={new Date(event.at).toISOString()}
                    >
                      {formatDateTime(event.at)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </>
  );
}
