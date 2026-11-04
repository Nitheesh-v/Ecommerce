"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Dialog } from "@/components/admin/ui/dialog";
import { Field, Input } from "@/components/admin/ui/input";
import { Select, Textarea } from "@/components/admin/ui/select";
import { ErrorState } from "@/components/admin/ui/states";
import { getApiErrorMessage } from "@/lib/api/errors";
import { customersService } from "@/services/admin/customers.service";
import { toast } from "@/store/toast.store";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_TRANSITIONS,
  type CustomerDetail,
  type CustomerStatus,
} from "@/types/customer";

const REASONS = [
  "Customer request",
  "Chargeback / payment abuse",
  "Suspected fraud",
  "Abusive behaviour",
  "Duplicate account",
  "Other",
];

const CONSEQUENCES: Record<CustomerStatus, string> = {
  active:
    "The account can sign in and place orders again. Earlier orders and payments are unchanged.",
  suspended:
    "The customer is signed out on every device, cannot sign in and cannot place orders. Orders, payments and invoices are kept.",
  deactivated:
    "The account is closed for sign-in and ordering. All order and payment history is preserved, and the account can be reactivated later.",
};

/**
 * Account-status change.
 *
 * The legal targets come from the same transition table the API enforces, and the
 * dialog spells out the consequences before submitting — suspending someone is not
 * a cosmetic label change.
 */
export function CustomerStatusDialog({
  customer,
  open,
  onClose,
  onDone,
}: {
  customer: CustomerDetail;
  open: boolean;
  onClose: () => void;
  onDone: (customer: CustomerDetail) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change account status"
      description={`${customer.fullName} · currently ${CUSTOMER_STATUS_LABELS[customer.status]}`}
    >
      <StatusForm customer={customer} onClose={onClose} onDone={onDone} />
    </Dialog>
  );
}

function StatusForm({
  customer,
  onClose,
  onDone,
}: {
  customer: CustomerDetail;
  onClose: () => void;
  onDone: (customer: CustomerDetail) => void;
}) {
  const targets = CUSTOMER_STATUS_TRANSITIONS[customer.status];
  const [status, setStatus] = useState<CustomerStatus>(targets[0] ?? customer.status);
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const updated = await customersService.updateStatus(customer.id, {
        status,
        reason: reason === "Other" ? note.trim() || "Other" : reason,
        note: note.trim() || undefined,
      });

      toast.success(
        `${customer.fullName} is now ${CUSTOMER_STATUS_LABELS[updated.status].toLowerCase()}`,
      );
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

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="New status" htmlFor="customer-status">
        <Select
          id="customer-status"
          value={status}
          onChange={(event) => setStatus(event.target.value as CustomerStatus)}
        >
          {targets.map((target) => (
            <option key={target} value={target}>
              {CUSTOMER_STATUS_LABELS[target]}
            </option>
          ))}
        </Select>
      </Field>

      <div
        className={
          status === "active"
            ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
            : "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        }
      >
        {CONSEQUENCES[status]}
      </div>

      <Field label="Reason" htmlFor="customer-reason">
        <Select
          id="customer-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        >
          {REASONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label={reason === "Other" ? "Reason (required)" : "Note (optional)"}
        htmlFor="customer-note"
        hint="Stored in the account history with your admin email."
      >
        <Textarea
          id="customer-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          className="min-h-16"
          placeholder="What happened, and what should the next person know?"
        />
      </Field>

      <Field label="Confirm with the account email" htmlFor="customer-confirm">
        <Input id="customer-confirm" value={customer.email} readOnly disabled />
      </Field>

      {error ? <ErrorState message={error} /> : null}

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={status === "active" ? "primary" : "danger"}
          disabled={submitting || targets.length === 0}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {status === "active"
            ? "Reactivate account"
            : status === "suspended"
              ? "Suspend account"
              : "Deactivate account"}
        </Button>
      </div>
    </form>
  );
}
