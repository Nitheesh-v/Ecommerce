"use client";

import { ArrowRight, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Dialog } from "@/components/admin/ui/dialog";
import { Field, Input } from "@/components/admin/ui/input";
import { Select, Textarea } from "@/components/admin/ui/select";
import { ErrorState, Skeleton } from "@/components/admin/ui/states";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { inventoryService } from "@/services/admin/inventory.service";
import { toast } from "@/store/toast.store";
import {
  ADJUSTMENT_ACTION_LABELS,
  ADJUSTMENT_REASON_LABELS,
  STOCK_STATUS_LABELS,
  type AdjustmentAction,
  type AdjustmentReason,
  type AdjustmentResult,
  type InventoryRow,
  type ProductStock,
} from "@/types/inventory";
import { StockStatusBadge } from "./stock-status-badge";

const ACTIONS: AdjustmentAction[] = ["increase", "decrease", "set"];
const REASONS: AdjustmentReason[] = [
  "new_stock",
  "damaged",
  "manual_correction",
  "returned",
  "purchase_return",
  "other",
];

/**
 * Stock adjustment modal.
 *
 * Deliberate rules, mirroring the API:
 * - the current quantity is re-read from the server when the dialog opens, so a
 *   stale table row can never become the basis of a write;
 * - the admin picks an **action + quantity**, and the resulting stock is previewed
 *   before confirming;
 * - a decrease below zero is blocked client-side *and* server-side;
 * - every confirmed adjustment is audited (product, admin, reason, before/after).
 */
export function AdjustStockDialog({
  row,
  onClose,
  onAdjusted,
}: {
  row: InventoryRow | null;
  onClose: () => void;
  /** Fired after a successful adjustment so the table/summary can refresh. */
  onAdjusted: (result: AdjustmentResult) => void;
}) {
  return (
    <Dialog
      open={row !== null}
      onClose={onClose}
      title={row ? `Adjust stock · ${row.name}` : "Adjust stock"}
      description={
        row
          ? `SKU ${row.sku} — every change is recorded in the stock history.`
          : undefined
      }
    >
      {row ? (
        // Remounting per product resets the form without an effect-based reset.
        <AdjustStockForm
          key={row.productId}
          row={row}
          onClose={onClose}
          onAdjusted={onAdjusted}
        />
      ) : null}
    </Dialog>
  );
}

function AdjustStockForm({
  row,
  onClose,
  onAdjusted,
}: {
  row: InventoryRow;
  onClose: () => void;
  onAdjusted: (result: AdjustmentResult) => void;
}) {
  const [stock, setStock] = useState<ProductStock | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [action, setAction] = useState<AdjustmentAction>("increase");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<"" | AdjustmentReason>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    inventoryService
      .productStock(row.productId, controller.signal)
      .then((data) => {
        if (active) {
          setStock(data);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) {
          return;
        }
        setLoadError(getApiErrorMessage(error));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [row.productId, reloadToken]);

  const parsedQuantity = useMemo(() => {
    const trimmed = quantity.trim();
    if (trimmed === "" || !/^\d+$/.test(trimmed)) {
      return null;
    }
    return Number(trimmed);
  }, [quantity]);

  const resulting = useMemo(() => {
    if (!stock || parsedQuantity === null) {
      return null;
    }
    if (action === "increase") {
      return stock.quantity + parsedQuantity;
    }
    if (action === "decrease") {
      return stock.quantity - parsedQuantity;
    }
    return parsedQuantity;
  }, [action, parsedQuantity, stock]);

  const validationError = useMemo(() => {
    if (parsedQuantity === null) {
      return quantity.trim() === "" ? null : "Enter a whole number of units";
    }
    if (action !== "set" && parsedQuantity < 1) {
      return "Enter at least 1 unit";
    }
    if (resulting !== null && resulting < 0) {
      return `Only ${stock?.quantity ?? 0} unit(s) available — stock cannot go negative`;
    }
    if (resulting !== null && resulting === stock?.quantity) {
      return "That would not change the current stock";
    }
    return null;
  }, [action, parsedQuantity, quantity, resulting, stock]);

  const canSubmit =
    stock !== null &&
    parsedQuantity !== null &&
    reason !== "" &&
    validationError === null &&
    resulting !== null &&
    resulting !== stock.quantity &&
    !submitting;

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit || parsedQuantity === null) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const result = await inventoryService.adjust({
        productId: row.productId,
        action,
        quantity: parsedQuantity,
        reason,
        notes: notes.trim() === "" ? undefined : notes.trim(),
      });

      toast.success(
        `${result.productName}: ${result.previousQuantity} → ${result.newQuantity} units`,
      );
      onAdjusted(result);
      onClose();
    } catch (error) {
      const message = getApiErrorMessage(error);

      setSubmitError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <ErrorState
        message={loadError}
        onRetry={() => {
          setLoadError(null);
          setReloadToken((token) => token + 1);
        }}
      />
    );
  }

  if (!stock) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const destructive = resulting !== null && resulting < stock.quantity;
  const delta =
    resulting === null ? null : resulting - stock.quantity;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
            Current stock
          </p>
          <p className="text-lg font-semibold text-slate-900 tabular-nums">
            {stock.quantity} units
          </p>
          <p className="text-xs text-slate-500">
            Threshold {stock.lowStockThreshold} · {STOCK_STATUS_LABELS[stock.stockStatus]}
          </p>
        </div>
        <StockStatusBadge status={stock.stockStatus} />
      </div>

      <Field label="Adjustment type" htmlFor="adjust-action">
        <Select
          id="adjust-action"
          value={action}
          onChange={(event) => setAction(event.target.value as AdjustmentAction)}
        >
          {ACTIONS.map((value) => (
            <option key={value} value={value}>
              {ADJUSTMENT_ACTION_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label={action === "set" ? "Counted quantity" : "Quantity"}
        htmlFor="adjust-quantity"
        hint={
          action === "set"
            ? "The quantity you counted — this becomes the new stock."
            : "Units to add or remove. Never applied twice."
        }
        error={validationError}
      >
        <Input
          id="adjust-quantity"
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          autoFocus
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          invalid={Boolean(validationError)}
          placeholder="0"
        />
      </Field>

      <Field label="Reason" htmlFor="adjust-reason">
        <Select
          id="adjust-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value as AdjustmentReason)}
        >
          <option value="">Select a reason…</option>
          {REASONS.map((value) => (
            <option key={value} value={value}>
              {ADJUSTMENT_REASON_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Notes (optional)" htmlFor="adjust-notes">
        <Textarea
          id="adjust-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={500}
          placeholder="e.g. Supplier invoice #482, 3 units crushed in transit"
          className="min-h-16"
        />
      </Field>

      <div
        className={cn(
          "rounded-lg border px-3 py-2.5",
          destructive
            ? "border-amber-200 bg-amber-50"
            : "border-emerald-200 bg-emerald-50",
        )}
        aria-live="polite"
      >
        <p className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <span className="tabular-nums">{stock.quantity}</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              destructive ? "text-amber-700" : "text-emerald-700",
            )}
          >
            {resulting ?? "—"}
          </span>
          {delta !== null && delta !== 0 ? (
            <span className={cn("text-xs", destructive ? "text-amber-700" : "text-emerald-700")}>
              ({delta > 0 ? "+" : ""}
              {delta})
            </span>
          ) : null}
        </p>
        {destructive ? (
          <p className="mt-1 flex items-start gap-1.5 text-[11px] text-amber-800">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            This reduces the sellable quantity and is recorded permanently.
          </p>
        ) : null}
      </div>

      {submitError ? <ErrorState message={submitError} /> : null}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Confirm adjustment
        </Button>
      </div>
    </form>
  );
}
