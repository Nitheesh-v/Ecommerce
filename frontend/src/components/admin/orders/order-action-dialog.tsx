"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Dialog } from "@/components/admin/ui/dialog";
import { Field, Input } from "@/components/admin/ui/input";
import { Select, Textarea } from "@/components/admin/ui/select";
import { ErrorState } from "@/components/admin/ui/states";
import { getApiErrorMessage } from "@/lib/api/errors";
import { toast } from "@/store/toast.store";
import { ordersService } from "@/services/admin/orders.service";
import {
  CANCELLATION_REASONS,
  ORDER_STATUS_LABELS,
  type Order,
  type OrderStatus,
} from "@/types/order";

export type OrderAction =
  | { type: "status" }
  | { type: "cancel" }
  | { type: "shipping" }
  | { type: "payment" }
  | { type: "refund" }
  | {
      type: "refund-decision";
      refundId: string;
      amount: number;
      reason: string;
    };

const TITLES: Record<OrderAction["type"], string> = {
  status: "Update order status",
  cancel: "Cancel this order",
  shipping: "Shipping & tracking",
  payment: "Record payment",
  refund: "Queue a refund",
  "refund-decision": "Confirm refund",
};

/**
 * One dialog for every order mutation.
 *
 * Each mode explains its own consequences before submitting — cancelling restores
 * stock and queues a refund obligation, recording a payment moves money, and a
 * refund decision is final. The server re-validates all of it.
 */
export function OrderActionDialog({
  order,
  action,
  onClose,
  onDone,
}: {
  order: Order;
  action: OrderAction | null;
  onClose: () => void;
  onDone: (order: Order) => void;
}) {
  return (
    <Dialog
      open={action !== null}
      onClose={onClose}
      title={action ? TITLES[action.type] : ""}
      description={order ? `Order ${order.orderNumber}` : undefined}
    >
      {action ? (
        // Remount per action so each form always starts clean.
        <ActionForm
          key={`${action.type}-${action.type === "refund-decision" ? action.refundId : ""}`}
          order={order}
          action={action}
          onClose={onClose}
          onDone={onDone}
        />
      ) : null}
    </Dialog>
  );
}

function ActionForm({
  order,
  action,
  onClose,
  onDone,
}: {
  order: Order;
  action: OrderAction;
  onClose: () => void;
  onDone: (order: Order) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // status
  const [status, setStatus] = useState<OrderStatus>(
    order.allowedNextStatuses[0] ?? order.status,
  );
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  // shipping
  const [provider, setProvider] = useState(order.shipping?.provider ?? "");
  const [trackingNumber, setTrackingNumber] = useState(
    order.shipping?.trackingNumber ?? "",
  );
  const [trackingUrl, setTrackingUrl] = useState(order.shipping?.trackingUrl ?? "");
  const [shippedAt, setShippedAt] = useState(
    order.shipping?.shippedAt?.slice(0, 10) ?? "",
  );
  const [estimatedDelivery, setEstimatedDelivery] = useState(
    order.shipping?.estimatedDelivery?.slice(0, 10) ?? "",
  );

  // payment
  const [paymentOutcome, setPaymentOutcome] = useState<"paid" | "failed">("paid");
  const [transactionId, setTransactionId] = useState(order.payment.transactionId ?? "");

  // refunds
  const refundable = Math.max(
    0,
    order.payment.paidAmount - order.refundedAmount - order.pendingRefundAmount,
  );
  const [amount, setAmount] = useState(
    action.type === "refund" && refundable > 0 ? String(refundable / 100) : "",
  );
  const [refundReference, setRefundReference] = useState("");

  const amountMinor = Math.round(Number(amount) * 100);
  const amountValid = Number.isFinite(amountMinor) && amountMinor > 0;
  const overRefundable = action.type === "refund" && amountMinor > refundable;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      let updated: Order;

      switch (action.type) {
        case "status":
          updated = await ordersService.updateStatus(order.id, {
            status,
            reason: reason.trim() || undefined,
            note: note.trim() || undefined,
          });
          break;

        case "cancel":
          updated = await ordersService.cancel(order.id, {
            reason: reason.trim() || CANCELLATION_REASONS[0],
            note: note.trim() || undefined,
          });
          break;

        case "shipping":
          updated = await ordersService.updateShipping(order.id, {
            provider: provider.trim() || undefined,
            trackingNumber: trackingNumber.trim() || undefined,
            trackingUrl: trackingUrl.trim() || undefined,
            shippedAt: shippedAt ? new Date(`${shippedAt}T00:00:00`).toISOString() : undefined,
            estimatedDelivery: estimatedDelivery
              ? new Date(`${estimatedDelivery}T00:00:00`).toISOString()
              : undefined,
            note: note.trim() || undefined,
          });
          break;

        case "payment":
          updated = await ordersService.updatePayment(order.id, {
            status: paymentOutcome,
            transactionId: transactionId.trim() || undefined,
            note: note.trim() || undefined,
          });
          break;

        case "refund":
          updated = await ordersService.createRefund(order.id, {
            amount: amountMinor,
            reason: reason.trim() || "Customer refund",
          });
          break;

        case "refund-decision":
          updated = await ordersService.updateRefund(order.id, action.refundId, {
            status: "processed",
            reference: refundReference.trim() || undefined,
            note: note.trim() || undefined,
          });
          break;
      }

      toast.success(successMessage(action.type, updated));
      onDone(updated);
      onClose();
    } catch (error_) {
      const message = getApiErrorMessage(error_);

      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const disabled =
    submitting ||
    (action.type === "refund" && (!amountValid || overRefundable)) ||
    (action.type === "status" && status === order.status);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {action.type === "status" ? (
        <>
          <Field label="New status" htmlFor="status">
            <Select
              id="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as OrderStatus)}
            >
              {order.allowedNextStatuses.length === 0 ? (
                <option value={order.status}>
                  No transitions available from {ORDER_STATUS_LABELS[order.status]}
                </option>
              ) : (
                order.allowedNextStatuses.map((next) => (
                  <option key={next} value={next}>
                    {ORDER_STATUS_LABELS[next]}
                  </option>
                ))
              )}
            </Select>
          </Field>

          <Field label="Reason (optional)" htmlFor="status-reason">
            <Input
              id="status-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Payment verified"
              maxLength={500}
            />
          </Field>
        </>
      ) : null}

      {action.type === "cancel" ? (
        <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Cancelling restores the stock for every line (once) and, if the order was
            paid, queues a refund that you still have to process separately.
          </div>
          <Field label="Cancellation reason" htmlFor="cancel-reason">
            <Select
              id="cancel-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              <option value="">Select a reason…</option>
              {CANCELLATION_REASONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
        </>
      ) : null}

      {action.type === "shipping" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Shipping provider" htmlFor="provider">
            <Input
              id="provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              placeholder="Delhivery, Bluedart, DTDC…"
              maxLength={60}
            />
          </Field>
          <Field label="Tracking number" htmlFor="tracking-number">
            <Input
              id="tracking-number"
              value={trackingNumber}
              onChange={(event) => setTrackingNumber(event.target.value)}
              maxLength={80}
            />
          </Field>
          <Field label="Tracking URL" htmlFor="tracking-url" hint="Must be a full URL">
            <Input
              id="tracking-url"
              type="url"
              value={trackingUrl}
              onChange={(event) => setTrackingUrl(event.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field label="Shipped on" htmlFor="shipped-at">
            <Input
              id="shipped-at"
              type="date"
              value={shippedAt}
              onChange={(event) => setShippedAt(event.target.value)}
            />
          </Field>
          <Field label="Estimated delivery" htmlFor="eta">
            <Input
              id="eta"
              type="date"
              value={estimatedDelivery}
              onChange={(event) => setEstimatedDelivery(event.target.value)}
            />
          </Field>
        </div>
      ) : null}

      {action.type === "payment" ? (
        <>
          <Field label="Outcome" htmlFor="payment-outcome">
            <Select
              id="payment-outcome"
              value={paymentOutcome}
              onChange={(event) => setPaymentOutcome(event.target.value as "paid" | "failed")}
            >
              <option value="paid">Payment received (full amount)</option>
              <option value="failed">Payment failed</option>
            </Select>
          </Field>
          {paymentOutcome === "paid" ? (
            <Field
              label="Transaction / UTR reference"
              htmlFor="transaction-id"
              hint="Bank or gateway reference — this is what you reconcile against."
            >
              <Input
                id="transaction-id"
                value={transactionId}
                onChange={(event) => setTransactionId(event.target.value)}
                maxLength={120}
              />
            </Field>
          ) : null}
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Only record a payment you have actually confirmed. The storefront can never
            mark an order paid.
          </p>
        </>
      ) : null}

      {action.type === "refund" ? (
        <>
          <Field
            label="Refund amount (₹)"
            htmlFor="refund-amount"
            hint={`Refundable: ₹${(refundable / 100).toLocaleString("en-IN")}`}
            error={
              overRefundable
                ? "Amount exceeds what is still refundable"
                : amount !== "" && !amountValid
                  ? "Enter an amount greater than zero"
                  : undefined
            }
          >
            <Input
              id="refund-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              invalid={overRefundable || (amount !== "" && !amountValid)}
            />
          </Field>
          <Field label="Reason" htmlFor="refund-reason">
            <Input
              id="refund-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Returned item, order cancelled"
              maxLength={500}
            />
          </Field>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            This only <strong>queues</strong> the refund. The payment status becomes
            “Refund pending” until you record that the money left your account.
          </p>
        </>
      ) : null}

      {action.type === "refund-decision" ? (
        <>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Marking{" "}
            <strong>₹{(action.amount / 100).toLocaleString("en-IN")}</strong> as refunded
            is final for this record ({action.reason}).
          </div>
          <Field
            label="Gateway refund id / UTR"
            htmlFor="refund-reference"
            hint="Reference proving the money was returned."
          >
            <Input
              id="refund-reference"
              value={refundReference}
              onChange={(event) => setRefundReference(event.target.value)}
              maxLength={120}
            />
          </Field>
        </>
      ) : null}

      {action.type !== "refund-decision" ? (
        <Field
          label={action.type === "status" ? "Internal note (optional)" : "Note (optional)"}
          htmlFor="action-note"
        >
          <Textarea
            id="action-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            className="min-h-16"
            placeholder="Anything the next person needs to know"
          />
        </Field>
      ) : null}

      {error ? <ErrorState message={error} /> : null}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={action.type === "cancel" ? "danger" : "primary"}
          disabled={disabled}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {confirmLabel(action.type)}
        </Button>
      </div>
    </form>
  );
}

function confirmLabel(type: OrderAction["type"]): string {
  switch (type) {
    case "cancel":
      return "Cancel order & restore stock";
    case "refund":
      return "Queue refund";
    case "refund-decision":
      return "Mark as refunded";
    case "payment":
      return "Record payment";
    case "shipping":
      return "Save shipping";
    default:
      return "Confirm";
  }
}

function successMessage(type: OrderAction["type"], order: Order): string {
  switch (type) {
    case "cancel":
      return `${order.orderNumber} cancelled — stock restored`;
    case "refund":
      return `Refund queued for ${order.orderNumber}`;
    case "refund-decision":
      return `Refund marked as processed`;
    case "payment":
      return `Payment updated on ${order.orderNumber}`;
    case "shipping":
      return `Shipping details saved on ${order.orderNumber}`;
    default:
      return `${order.orderNumber} is now ${ORDER_STATUS_LABELS[order.status].toLowerCase()}`;
  }
}
