"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Card, CardHeader } from "@/components/admin/ui/card";
import { Dialog } from "@/components/admin/ui/dialog";
import { Field, Input } from "@/components/admin/ui/input";
import { Textarea } from "@/components/admin/ui/select";
import { ErrorState } from "@/components/admin/ui/states";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { ordersService } from "@/services/admin/orders.service";
import { toast } from "@/store/toast.store";
import type { Order, OrderReturn, ReturnStatus } from "@/types/order";
import { ReturnStatusBadge } from "./order-badges";

type NextAction = "approve" | "reject" | "receive" | "inspect" | "complete";

const ACTION_LABELS: Record<NextAction, string> = {
  approve: "Approve return",
  reject: "Reject return",
  receive: "Mark received",
  inspect: "Record inspection",
  complete: "Complete & settle",
};

/**
 * Return workflow.
 *
 * Nothing is restocked or refunded by merely requesting a return: stock only moves
 * when the operator completes the return with restocking approved, and money only
 * moves through a separate refund. The panel mirrors that order of operations.
 */
export function ReturnPanel({
  order,
  onUpdated,
}: {
  order: Order;
  onUpdated: (order: Order) => void;
}) {
  const [active, setActive] = useState<{ returnId: string; action: NextAction } | null>(
    null,
  );

  if (order.returns.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader
        title="Returns"
        description="Approve, inspect and settle — restocking and refunding are separate decisions."
      />
      <ul className="divide-y divide-slate-100">
        {order.returns.map((entry) => (
          <li key={entry.returnId} className="px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                <span className="text-xs font-medium text-slate-800">
                  {entry.items
                    .map((item) => `${item.quantity} × ${item.name}`)
                    .join(", ")}
                </span>
                <ReturnStatusBadge status={entry.status} />
              </div>
              <p className="text-[11px] text-slate-400">
                Requested {formatDateTime(entry.requestedAt)}
                {entry.refundableAmount > 0
                  ? ` · refundable ${formatCurrency(entry.refundableAmount)}`
                  : ""}
              </p>
            </div>

            <p className="mt-1 text-xs text-slate-600">{entry.reason}</p>
            {entry.inspectionNotes ? (
              <p className="mt-1 text-[11px] text-slate-500">
                Inspection: {entry.inspectionNotes}
              </p>
            ) : null}
            {entry.restockedAt ? (
              <p className="mt-1 text-[11px] text-emerald-700">
                Restocked {formatDateTime(entry.restockedAt)}
              </p>
            ) : null}

            <ReturnActions
              entry={entry}
              onAction={(action) => setActive({ returnId: entry.returnId, action })}
            />
          </li>
        ))}
      </ul>

      <ReturnDialog
        order={order}
        active={active}
        onClose={() => setActive(null)}
        onDone={onUpdated}
      />
    </Card>
  );
}

function nextActions(status: ReturnStatus): NextAction[] {
  switch (status) {
    case "requested":
      return ["approve", "reject"];
    case "approved":
      return ["receive", "reject"];
    case "received":
      return ["inspect"];
    case "inspected":
    case "restocked":
      return ["complete"];
    default:
      return [];
  }
}

function ReturnActions({
  entry,
  onAction,
}: {
  entry: OrderReturn;
  onAction: (action: NextAction) => void;
}) {
  const actions = nextActions(entry.status);

  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action}
          size="sm"
          variant={action === "reject" ? "danger" : "secondary"}
          onClick={() => onAction(action)}
        >
          {ACTION_LABELS[action]}
        </Button>
      ))}
    </div>
  );
}

function ReturnDialog({
  order,
  active,
  onClose,
  onDone,
}: {
  order: Order;
  active: { returnId: string; action: NextAction } | null;
  onClose: () => void;
  onDone: (order: Order) => void;
}) {
  return (
    <Dialog
      open={active !== null}
      onClose={onClose}
      title={active ? ACTION_LABELS[active.action] : ""}
      description={`Order ${order.orderNumber}`}
    >
      {active ? (
        <ReturnForm
          key={`${active.returnId}-${active.action}`}
          order={order}
          returnId={active.returnId}
          action={active.action}
          onClose={onClose}
          onDone={onDone}
        />
      ) : null}
    </Dialog>
  );
}

function ReturnForm({
  order,
  returnId,
  action,
  onClose,
  onDone,
}: {
  order: Order;
  returnId: string;
  action: NextAction;
  onClose: () => void;
  onDone: (order: Order) => void;
}) {
  const entry = order.returns.find((item) => item.returnId === returnId);
  const [note, setNote] = useState("");
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [restockApproved, setRestockApproved] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsInspection = action === "inspect";
  const needsRestockChoice = action === "inspect" || action === "complete";
  // Every unit coming back is a restock candidate; whether it is sellable is the
  // operator's inspection decision, not a product flag.
  const restockable = entry?.items ?? [];

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload: Parameters<typeof ordersService.updateReturn>[2] = { action };

      if (needsInspection) {
        if (inspectionNotes.trim().length > 1) {
          payload.inspectionNotes = inspectionNotes.trim();
        }
        payload.restockApproved = restockApproved;
      } else if (needsRestockChoice) {
        payload.restockApproved = restockApproved;
      }

      if (note.trim()) {
        payload.note = note.trim();
      }

      const updated = await ordersService.updateReturn(order.id, returnId, payload);

      toast.success(`${ACTION_LABELS[action]} — done`);
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
      {action === "reject" ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          Rejecting closes the request and returns the order to “Delivered”. No stock is
          restored and no refund is issued.
        </p>
      ) : null}

      {needsRestockChoice && restockable.length > 0 ? (
        <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <input
            type="checkbox"
            checked={restockApproved}
            onChange={(event) => setRestockApproved(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-xs text-slate-700">
            Restock the returned units
            <span className="mt-0.5 block text-[11px] text-slate-500">
              Only tick this when the items are sellable. Restocking is applied exactly
              once.
            </span>
          </span>
        </label>
      ) : null}

      {needsInspection ? (
        <Field label="Inspection notes" htmlFor="inspection-notes">
          <Textarea
            id="inspection-notes"
            value={inspectionNotes}
            onChange={(event) => setInspectionNotes(event.target.value)}
            placeholder="e.g. Seal intact, packaging undamaged"
            maxLength={500}
            className="min-h-16"
          />
        </Field>
      ) : null}

      <Field label="Note (optional)" htmlFor="return-note">
        <Input
          id="return-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
        />
      </Field>

      {error ? <ErrorState message={error} /> : null}

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={action === "reject" ? "danger" : "primary"}
          disabled={submitting}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {ACTION_LABELS[action]}
        </Button>
      </div>
    </form>
  );
}
