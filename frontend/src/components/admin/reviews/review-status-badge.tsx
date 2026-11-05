"use client";

import { Star } from "lucide-react";
import { Badge } from "@/components/admin/ui/badge";
import { cn } from "@/lib/utils";
import type { ReviewStatus } from "@/types/review";

const TONES: Record<ReviewStatus, "warning" | "success" | "danger"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

export function ReviewStatusBadge({
  status,
  label,
}: {
  status: ReviewStatus;
  label: string;
}) {
  return <Badge tone={TONES[status]}>{label}</Badge>;
}

/** 1–5 stars, with the value readable to screen readers. */
export function StarRating({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            "h-3.5 w-3.5",
            star <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}
