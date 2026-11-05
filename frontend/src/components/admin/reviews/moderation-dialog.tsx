"use client";

import { useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Dialog } from "@/components/admin/ui/dialog";
import { Field, Input } from "@/components/admin/ui/input";
import { getApiErrorMessage } from "@/lib/api/errors";
import { reviewsService } from "@/services/admin/reviews.service";
import { toast } from "@/store/toast.store";
import type { AdminReview } from "@/types/review";

export type ModerationAction = "approve" | "reject" | "delete";

const TITLES: Record<ModerationAction, string> = {
  approve: "Publish this review?",
  reject: "Reject this review?",
  delete: "Delete this review?",
};

/**
 * Approve / reject / delete confirmation.
 *
 * The form is keyed by review + action, so its state initialises from props on
 * mount instead of being synchronised in an effect, and it only exists while the
 * dialog is open. Rejections must carry a reason — the API enforces the same rule,
 * this just saves the round trip.
 */
export function ModerationDialog({
  review,
  action,
  onClose,
  onDone,
}: {
  review: AdminReview | null;
  action: ModerationAction | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const open = review !== null && action !== null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={action ? TITLES[action] : ""}
      description={
        review
          ? `“${review.title ?? 'Untitled'}” · ${review.ratingLabel} by ${review.customerName}`
          : undefined
      }
    >
      {open ? (
        <ModerationForm
          key={`${review.id}:${action}`}
          review={review}
          action={action}
          onClose={onClose}
          onDone={onDone}
        />
      ) : null}
    </Dialog>
  );
}

function ModerationForm({
  review,
  action,
  onClose,
  onDone,
}: {
  review: AdminReview;
  action: ModerationAction;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = reason.trim();

    if (action === "reject" && trimmed.length < 5) {
      setError("Give a short reason (at least 5 characters) — it is stored with the review");

      return;
    }

    setBusy(true);
    setError(null);

    try {
      if (action === "delete") {
        await reviewsService.remove(review.id);
        toast.success("Review deleted");
      } else {
        await reviewsService.moderate(
          review.id,
          action === "approve" ? "approved" : "rejected",
          trimmed || undefined,
        );
        toast.success(action === "approve" ? "Review published" : "Review rejected");
      }

      onDone();
      onClose();
    } catch (error_) {
      setError(getApiErrorMessage(error_));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <p className="line-clamp-3">{review.comment}</p>
        <p className="mt-2 text-slate-400">
          Order {review.orderNumber} · {review.customerEmail}
        </p>
      </div>

      {action === "reject" ? (
        <Field
          label="Reason"
          htmlFor="moderation-reason"
          hint="Stored on the review; the customer sees that it was not published."
        >
          <Input
            id="moderation-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            placeholder="Contains personal information"
            invalid={Boolean(error)}
          />
        </Field>
      ) : null}

      {action === "delete" ? (
        <p className="text-sm text-slate-600">
          The review is removed permanently. Approve it instead if you only want it
          hidden from the storefront.
        </p>
      ) : null}

      {error ? (
        <p className="text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant={action === "approve" ? "primary" : "danger"}
          onClick={() => void submit()}
          disabled={busy}
        >
          {busy
            ? "Saving…"
            : action === "approve"
              ? "Publish review"
              : action === "reject"
                ? "Reject review"
                : "Delete review"}
        </Button>
      </div>
    </div>
  );
}
