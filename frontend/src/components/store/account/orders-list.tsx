"use client";

import Link from "next/link";
import { Package, Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { formatCurrency, formatDate } from "@/lib/utils";
import { myOrdersService } from "@/services/store/payments.service";
import type { Order } from "@/types/order";

interface State {
  orders: Order[];
  loading: boolean;
  error: string | null;
}

/** The customer's own orders. The API scopes the list; a foreign id is a 404. */
export function OrdersList() {
  const [state, setState] = useState<State>({ orders: [], loading: true, error: null });

  useEffect(() => {
    const controller = new AbortController();

    myOrdersService
      .list(1, 20, controller.signal)
      .then(({ data }) => {
        if (!controller.signal.aborted) {
          setState({ orders: data, loading: false, error: null });
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted && !isAbortError(cause)) {
          setState({ orders: [], loading: false, error: getApiErrorMessage(cause) });
        }
      });

    return () => controller.abort();
  }, []);

  if (state.loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-24 animate-pulse rounded-xl bg-slate-100" aria-hidden />
        ))}
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {state.error}
      </div>
    );
  }

  if (state.orders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <Receipt className="mx-auto h-6 w-6 text-slate-300" aria-hidden />
        <h2 className="mt-3 text-base font-semibold text-slate-900">No orders yet</h2>
        <p className="mt-1 text-sm text-slate-500">
          When you place an order it appears here with its delivery timeline.
        </p>
        <Link
          href="/products"
          className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {state.orders.map((order) => (
        <li
          key={order.id}
          className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Package className="h-4 w-4 text-slate-400" aria-hidden />
                {order.orderNumber}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Placed {formatDate(order.createdAt)} · {order.items.length}{" "}
                {order.items.length === 1 ? "item" : "items"}
              </p>
              <p className="mt-1 line-clamp-1 text-xs text-slate-600">
                {order.items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}
              </p>
            </div>

            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">
                {formatCurrency(order.total)}
              </p>
              <p className="text-[11px] text-slate-500 capitalize">
                {order.status.replace(/_/g, " ")}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-xs">
            <Link
              href={`/account/orders/${order.id}/tracking`}
              className="font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900"
            >
              Track order
            </Link>
            {order.paymentStatus !== "paid" && order.paymentMethod !== "cod" ? (
              <Link
                href={`/pay/${order.id}`}
                className="font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900"
              >
                Complete payment
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
