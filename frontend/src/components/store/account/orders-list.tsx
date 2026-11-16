// src/components/store/account/orders-list.tsx

"use client";

import Link from "next/link";
import { Ban, FileText, Package, Receipt, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { formatCurrency, formatDate } from "@/lib/utils";
import { myOrdersService } from "@/services/store/orders.service";
import { toast } from "@/store/toast.store";
import { ORDER_STATUS_LABELS, type Order } from "@/types/order";

interface State {
  orders: Order[];
  loading: boolean;
  error: string | null;
}

type ActionKind = "cancel" | "return";

interface OpenAction {
  order: Order;
  kind: ActionKind;
}

interface ReturnLineDraft {
  productId: string;
  name: string;
  maxQuantity: number;
  include: boolean;
  quantity: number;
}

/**
 * The customer's own orders, with the three things a customer actually needs from
 * that page: track it, get the invoice, and — while the rules allow it — cancel or
 * return it.
 *
 * The buttons are not the policy: `canCancel` and `canRequestReturn` come from the
 * API, which re-checks ownership and state on every write, so a stale page can only
 * ever produce a clear 409 rather than a wrong outcome.
 */
export function OrdersList() {
  const [state, setState] = useState<State>({ orders: [], loading: true, error: null });
  const [reloadToken, setReloadToken] = useState(0);

  const [action, setAction] = useState<OpenAction | null>(null);
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<ReturnLineDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
  }, [reloadToken]);

  function openAction(order: Order, kind: ActionKind) {
    setAction({ order, kind });
    setReason("");
    setFormError(null);
    setLines(
      order.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        maxQuantity: item.quantity,
        include: true,
        quantity: item.quantity,
      })),
    );
  }

  function closeAction() {
    setAction(null);
    setFormError(null);
  }

  async function submitAction() {
    if (!action) {
      return;
    }

    const trimmed = reason.trim();

    if (trimmed.length < 3) {
      setFormError("Tell us why — a few words is enough.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      if (action.kind === "cancel") {
        await myOrdersService.cancel(action.order.id, trimmed);
        toast.success(`Order ${action.order.orderNumber} cancelled.`);
      } else {
        const items = lines
          .filter((line) => line.include && line.quantity > 0)
          .map((line) => ({ productId: line.productId, quantity: line.quantity }));

        if (items.length === 0) {
          setFormError("Choose at least one item to return.");
          setSubmitting(false);
          return;
        }

        await myOrdersService.requestReturn(action.order.id, { reason: trimmed, items });
        toast.success("Return requested — the store will review it.");
      }

      closeAction();
      setReloadToken((token) => token + 1);
    } catch (cause) {
      setFormError(getApiErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  if (state.loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-24 animate-pulse rounded-xl bg-cream-200" aria-hidden />
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
      <div className="rounded-xl border border-dashed border-cream-400 bg-cream-50 px-6 py-16 text-center">
        <Receipt className="mx-auto h-6 w-6 text-cream-400" aria-hidden />
        <h2 className="mt-3 text-base font-semibold text-bark-900">No orders yet</h2>
        <p className="mt-1 text-sm text-bark-500">
          When you place an order it appears here with its delivery timeline.
        </p>
        <Link
          href="/products"
          className="mt-4 inline-flex rounded-full bg-baby-400 px-4 py-2 text-sm font-semibold text-bark-950 hover:bg-baby-300"
        >
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {state.orders.map((order) => {
        const open = action?.order.id === order.id ? action : null;

        return (
          <li
            key={order.id}
            className="rounded-xl border border-cream-300 bg-cream-50 p-4 transition-colors hover:border-cream-400"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-bark-900">
                  <Package className="h-4 w-4 text-bark-400" aria-hidden />
                  {order.orderNumber}
                </p>
                <p className="mt-0.5 text-xs text-bark-500">
                  Placed {formatDate(order.createdAt)} · {order.items.length}{" "}
                  {order.items.length === 1 ? "item" : "items"}
                </p>
                <p className="mt-1 line-clamp-1 text-xs text-bark-700">
                  {order.items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm font-semibold text-bark-900">
                  {formatCurrency(order.total)}
                </p>
                <p className="text-[11px] text-bark-500">
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </p>
              </div>
            </div>

            {order.activeReturn ? (
              <p className="mt-3 rounded-lg bg-baby-100 px-3 py-2 text-[11px] text-bark-800">
                Return {order.activeReturn.status.replace(/_/g, " ")} · requested{" "}
                {formatDate(order.activeReturn.requestedAt)}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-cream-200 pt-3 text-xs">
              <Link
                href={`/account/orders/${order.id}/tracking`}
                className="font-medium text-bark-800 underline underline-offset-2 hover:text-bark-900"
              >
                Track order
              </Link>

              <Link
                href={`/account/orders/${order.id}/invoice`}
                className="inline-flex items-center gap-1 font-medium text-bark-800 underline underline-offset-2 hover:text-bark-900"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden />
                Invoice
              </Link>

              {order.paymentStatus !== "paid" && order.paymentMethod !== "cod" ? (
                <Link
                  href={`/pay/${order.id}`}
                  className="font-medium text-bark-800 underline underline-offset-2 hover:text-bark-900"
                >
                  Complete payment
                </Link>
              ) : null}

              {order.canCancel ? (
                <button
                  type="button"
                  onClick={() => openAction(order, "cancel")}
                  className="inline-flex items-center gap-1 font-medium text-bark-700 underline underline-offset-2 hover:text-bark-900"
                >
                  <Ban className="h-3.5 w-3.5" aria-hidden />
                  Cancel order
                </button>
              ) : null}

              {order.canRequestReturn && !order.activeReturn ? (
                <button
                  type="button"
                  onClick={() => openAction(order, "return")}
                  className="inline-flex items-center gap-1 font-medium text-bark-700 underline underline-offset-2 hover:text-bark-900"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden />
                  Request a return
                </button>
              ) : null}
            </div>

            {open ? (
              <form
                className="mt-3 space-y-3 rounded-xl border border-cream-300 bg-cream-100 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitAction();
                }}
              >
                <p className="text-xs font-semibold text-bark-900">
                  {open.kind === "cancel"
                    ? `Cancel ${order.orderNumber}`
                    : `Return items from ${order.orderNumber}`}
                </p>

                {open.kind === "return" ? (
                  <ul className="space-y-2">
                    {lines.map((line, index) => (
                      <li key={line.productId} className="flex items-center gap-3 text-xs">
                        <input
                          type="checkbox"
                          checked={line.include}
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((entry, position) =>
                                position === index
                                  ? { ...entry, include: event.target.checked }
                                  : entry,
                              ),
                            )
                          }
                          aria-label={`Return ${line.name}`}
                          className="h-3.5 w-3.5 accent-bark-900"
                        />
                        <span className="min-w-0 flex-1 truncate text-bark-800">
                          {line.name}
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={line.maxQuantity}
                          value={line.quantity}
                          disabled={!line.include}
                          aria-label={`Quantity of ${line.name}`}
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((entry, position) =>
                                position === index
                                  ? {
                                      ...entry,
                                      quantity: Math.min(
                                        Math.max(Number(event.target.value) || 1, 1),
                                        entry.maxQuantity,
                                      ),
                                    }
                                  : entry,
                              ),
                            )
                          }
                          className="h-7 w-16 rounded-md border border-cream-400 bg-cream-50 px-2 text-right text-xs text-bark-900 disabled:opacity-50"
                        />
                        <span className="w-14 text-right text-[11px] text-bark-500">
                          of {line.maxQuantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <label className="block">
                  <span className="text-[11px] font-medium text-bark-700">
                    {open.kind === "cancel" ? "Why are you cancelling?" : "Why are you returning?"}
                  </span>
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={2}
                    maxLength={500}
                    required
                    className="mt-1 w-full rounded-lg border border-cream-400 bg-cream-50 px-3 py-2 text-xs text-bark-900 placeholder:text-bark-500 focus:outline-none focus:ring-2 focus:ring-baby-300"
                    placeholder={
                      open.kind === "cancel"
                        ? "Ordered by mistake, found a better price…"
                        : "Damaged on arrival, wrong size, changed my mind…"
                    }
                  />
                </label>

                {formError ? (
                  <p role="alert" className="text-[11px] text-rose-700">
                    {formError}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="accent" size="sm" loading={submitting}>
                    {open.kind === "cancel" ? "Cancel this order" : "Submit return request"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={closeAction}
                    disabled={submitting}
                  >
                    Keep it
                  </Button>
                </div>

                <p className="text-[11px] text-bark-500">
                  {open.kind === "cancel"
                    ? "Cancellation is only possible before the order ships."
                    : "Returns are only possible for delivered orders, and the store reviews each request."}
                </p>
              </form>
            ) : null}

          </li>
        );
      })}
    </ul>
  );
}
