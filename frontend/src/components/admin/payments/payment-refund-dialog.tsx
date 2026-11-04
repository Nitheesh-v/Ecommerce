"use client";

import { useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Dialog } from "@/components/admin/ui/dialog";
import { Field, Input } from "@/components/admin/ui/input";
import { Textarea } from "@/components/admin/ui/select";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatCurrency } from "@/lib/utils";
import { paymentsService } from "@/services/admin/payments.service";
import { toast } from "@/store/toast.store";
import type { PaymentDetail, RefundPaymentResult } from "@/types/payment";

/**
 * Refund dialog.
 *
 * The amount is entered in rupees and sent in paise. The server re-checks it
 * against the captured amount and refuses a second refund while one is pending —
 * this form is convenience, not the safety mechanism.
 */
export function PaymentRefundDialog({
  open,
  payment,
  onClose,
  onRefunded,
}: {
  open: boolean;
  payment: PaymentDetail;
  onClose: () => void;
  onRefunded: (result: RefundPaymentResult) => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const refundable = payment.refundableAmount;
  const hasPendingRefund = payment.refunds.some((refund) => refund.status === "pending");

  /** Closing always clears the form, so reopening never shows a stale amount. */
  const closeDialog = () => {
    setAmount("");
    setReason("");
    setNote("");
    setErrors({});
    setSubmitting(false);
    onClose();
  };

  const onSubmit = async () => {
    const amountInMinorUnits = Math.round(Number(amount) * 100);
    const nextErrors: { amount?: string; reason?: string } = {};

    if (!Number.isFinite(amountInMinorUnits) || amountInMinorUnits < 1) {
      nextErrors.amount = "Enter a refund amount greater than zero";
    } else if (amountInMinorUnits > refundable) {
      nextErrors.amount = `At most ${formatCurrency(refundable, payment.currency)} can be refunded`;
    }

    if (reason.trim().length < 3) {
      nextErrors.reason = "A reason is required — it is stored on the refund";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      const result = await paymentsService.refund(payment.id, {
        amount: amountInMinorUnits,
        reason: reason.trim(),
        note: note.trim() || undefined,
      });

      toast.success(
        `Refund of ${formatCurrency(result.refund.amount, payment.currency)} sent to the gateway`,
      );
      onRefunded(result);
      closeDialog();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={closeDialog}
      title="Refund this payment"
      description="The refund is executed by Razorpay and recorded against the order. A cancellation is not a refund."
      footer={
        <>
          <Button variant="secondary" onClick={closeDialog} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onSubmit} loading={submitting}>
            Refund
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <p>
            Captured{" "}
            <span className="font-medium text-slate-900">
              {formatCurrency(payment.amount, payment.currency)}
            </span>
            {payment.refundedAmount > 0 ? (
              <>
                {" · "}already refunded{" "}
                <span className="font-medium text-slate-900">
                  {formatCurrency(payment.refundedAmount, payment.currency)}
                </span>
              </>
            ) : null}
          </p>
          <p className="mt-1">
            Refundable now:{" "}
            <span className="font-medium text-slate-900">
              {formatCurrency(refundable, payment.currency)}
            </span>
          </p>
        </div>

        {hasPendingRefund ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            A refund is already pending on this order. Finish or fail it before starting
            another.
          </p>
        ) : null}

        <Field
          label="Refund amount (₹)"
          htmlFor="refund-amount"
          error={errors.amount}
          hint={`Maximum ${formatCurrency(refundable, payment.currency)}`}
        >
          <Input
            id="refund-amount"
            type="number"
            inputMode="decimal"
            min="1"
            max={refundable / 100}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={(refundable / 100).toFixed(2)}
            invalid={Boolean(errors.amount)}
          />
        </Field>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAmount((refundable / 100).toFixed(2))}
          >
            Full amount
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAmount("")}>
            Clear
          </Button>
        </div>

        <Field
          label="Reason (required)"
          htmlFor="refund-reason"
          error={errors.reason}
        >
          <Input
            id="refund-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Damaged item, duplicate charge, customer request…"
            maxLength={500}
            invalid={Boolean(errors.reason)}
          />
        </Field>

        <Field label="Internal note (optional)" htmlFor="refund-note">
          <Textarea
            id="refund-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="Anything the finance team should know"
          />
        </Field>
      </div>
    </Dialog>
  );
}
