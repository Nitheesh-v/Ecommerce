"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { getApiErrorStatus, getApiErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { customerReviewsService } from "@/services/reviews.service";
import { toast } from "@/store/toast.store";

type Status =
  | { state: "loading" }
  | { state: "anonymous" }
  | { state: "blocked"; reason: string }
  | { state: "eligible"; orderNumber: string }
  | { state: "submitted" }
  | { state: "error"; message: string };

/**
 * Write-a-review form.
 *
 * The button is only a hint: the API re-checks the delivered order on submit, so a
 * customer who never received the product cannot post even if this component were
 * bypassed. New reviews land in moderation, which is what the success state says.
 */
export function ReviewForm({ productSlug }: { productSlug: string }) {
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    customerReviewsService
      .eligibility(productSlug, controller.signal)
      .then((result) => {
        if (!active) {
          return;
        }

        if (result.canReview) {
          setStatus({ state: "eligible", orderNumber: result.orderNumber ?? "" });

          return;
        }

        if (result.existingReviewStatus) {
          setStatus({
            state: "submitted",
          });

          return;
        }

        setStatus({ state: "blocked", reason: result.reason ?? "You cannot review this product" });
      })
      .catch((error_: unknown) => {
        if (!active) {
          return;
        }

        if (getApiErrorStatus(error_) === 401) {
          setStatus({ state: "anonymous" });

          return;
        }

        setStatus({ state: "error", message: getApiErrorMessage(error_) });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [productSlug]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      await customerReviewsService.submit(productSlug, {
        rating,
        comment: comment.trim(),
        ...(title.trim() ? { title: title.trim() } : {}),
      });

      toast.success("Thanks! Your review is awaiting moderation");
      setStatus({ state: "submitted" });
    } catch (error_) {
      setError(getApiErrorMessage(error_));
    } finally {
      setSaving(false);
    }
  };

  if (status.state === "loading") {
    return <div className="h-10 animate-pulse rounded-lg bg-slate-100" />;
  }

  if (status.state === "anonymous") {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <a href="/admin/login" className="font-medium text-indigo-600 hover:underline">
          Sign in
        </a>{" "}
        to review a product you have received.
      </p>
    );
  }

  if (status.state === "blocked") {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {status.reason}
      </p>
    );
  }

  if (status.state === "submitted") {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        Your review is waiting for moderation. It appears here once it is published.
      </p>
    );
  }

  if (status.state === "error") {
    return <p className="text-xs text-rose-600">{status.message}</p>;
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-3 rounded-xl border border-slate-200 p-4"
    >
      <div>
        <p className="text-sm font-semibold text-slate-900">Write a review</p>
        <p className="text-xs text-slate-500">
          Verified purchase · order {status.orderNumber}
        </p>
      </div>

      <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={rating === star}
            aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
            onClick={() => setRating(star)}
            className="rounded p-0.5"
          >
            <Star
              className={cn(
                "h-6 w-6",
                star <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300",
              )}
              aria-hidden
            />
          </button>
        ))}
        <span className="ml-1 text-xs text-slate-500">{rating} / 5</span>
      </div>

      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={120}
        placeholder="Headline (optional)"
        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-slate-400 focus:outline-none"
        aria-label="Review headline"
      />

      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        minLength={10}
        maxLength={2000}
        rows={4}
        required
        placeholder="What did you like or dislike? (at least 10 characters)"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        aria-label="Review comment"
      />

      {error ? (
        <p className="text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Published after moderation.</p>
        <button
          type="submit"
          disabled={saving || comment.trim().length < 10}
          className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:bg-slate-300"
        >
          {saving ? "Submitting…" : "Submit review"}
        </button>
      </div>
    </form>
  );
}
