"use client";

import { CheckCircle2, Loader2, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { Skeleton } from "@/components/admin/ui/states";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { formatCurrency } from "@/lib/utils";
import { openCheckout } from "@/lib/payments/razorpay-checkout";
import { checkoutService, myOrdersService } from "@/services/store/payments.service";
import type { Order } from "@/types/order";
import type { VerifyPaymentResult } from "@/types/payment";

interface LoadState {
  key: string;
  order: Order | null;
  error: string | null;
}

/**
 * "Pay for this order" page.
 *
 * The server decides the amount and creates the gateway order; this component
 * only opens the hosted widget and reports the result. It never sends an amount,
 * and it never treats the widget's success callback as proof — the verification
 * call does that.
 */
export function PayOrderView({ orderId }: { orderId: string }) {
  const [state, setState] = useState<LoadState>({ key: "", order: null, error: null });
  const [paying, setPaying] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [verified, setVerified] = useState<VerifyPaymentResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    myOrdersService
      .get(orderId, controller.signal)
      .then((order) => {
        if (active) {
          setState({ key: orderId, order, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) {
          return;
        }

        setState({ key: orderId, order: null, error: getApiErrorMessage(error) });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [orderId]);

  const loading = state.key !== orderId;
  const order = state.order;
  const error = state.key === orderId ? state.error : null;

  const paid = Boolean(verified) || order?.paymentStatus === "paid";

  const startPayment = async () => {
    if (!order) {
      return;
    }

    setPaying(true);
    setFailure(null);

    try {
      const session = await checkoutService.createOrder(order.id);

      await openCheckout(session, {
        onVerified: (result) => {
          setVerified(result);
          setPaying(false);
        },
        onFailed: (message) => {
          setFailure(message);
          setPaying(false);
        },
        onDismissed: () => {
          setPaying(false);
          setFailure("Checkout closed before the payment was completed");
        },
      });
    } catch (error_: unknown) {
      setFailure(getApiErrorMessage(error_));
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <Card className="mx-auto max-w-xl space-y-3 p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-full" />
      </Card>
    );
  }

  if (error || !order) {
    return (
      <Card className="mx-auto max-w-xl p-6">
        <p className="text-sm font-medium text-slate-900">This order cannot be opened</p>
        <p className="mt-1 text-sm text-slate-600">
          {error ?? "The order could not be loaded."}
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Payments are only available to the account that placed the order.{" "}
          <Link
            href="/admin/login"
            className="font-medium text-slate-700 underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardHeader
          title={`Order ${order.orderNumber}`}
          description={`Placed ${new Date(order.createdAt).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}`}
        />
        <CardBody className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-slate-600">Amount due</span>
            <span className="text-2xl font-semibold text-slate-900">
              {formatCurrency(order.total, order.currency)}
            </span>
          </div>

          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {order.items.map((item) => (
              <li
                key={`${item.sku}-${item.name}`}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-slate-700">
                  {item.quantity} × {item.name}
                </span>
                <span className="shrink-0 text-slate-900">
                  {formatCurrency(item.lineTotal, order.currency)}
                </span>
              </li>
            ))}
          </ul>

          {paid ? (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              <div className="text-sm text-emerald-900">
                <p className="font-medium">Payment received</p>
                <p className="text-xs text-emerald-800">
                  {verified
                    ? `Status: ${verified.statusLabel}. The order is confirmed and will be processed.`
                    : "This order is already paid."}
                </p>
              </div>
            </div>
          ) : (
            <>
              <Button onClick={startPayment} loading={paying} className="w-full">
                {paying ? "Opening secure checkout…" : `Pay ${formatCurrency(order.total, order.currency)}`}
              </Button>

              <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                <Lock className="h-3 w-3" aria-hidden />
                Card details are entered on Razorpay&apos;s hosted checkout — this store
                never sees or stores them.
              </p>
            </>
          )}

          {failure ? (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
              <p className="text-xs text-rose-800">{failure}</p>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
        <ShieldCheck className="h-3 w-3" aria-hidden />
        Payments are confirmed by the gateway — an order is only marked paid after
        signature verification.
      </p>
    </div>
  );
}

/** Loading indicator shared with the page shell. */
export function PayLoading() {
  return (
    <div className="flex items-center justify-center py-10 text-sm text-slate-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      Loading order…
    </div>
  );
}
