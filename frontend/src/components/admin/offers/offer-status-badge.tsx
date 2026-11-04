"use client";

import { Badge } from "@/components/admin/ui/badge";
import type { OfferLifecycleStatus, RedemptionStatus } from "@/types/offer";

type Tone = "success" | "info" | "warning" | "danger" | "neutral";

const OFFER_TONES: Record<OfferLifecycleStatus, Tone> = {
  active: "success",
  scheduled: "info",
  expired: "neutral",
  exhausted: "warning",
  inactive: "danger",
};

/** Lifecycle pill. The status is derived by the API, never stored separately. */
export function OfferStatusBadge({
  status,
  label,
}: {
  status: OfferLifecycleStatus;
  label: string;
}) {
  return <Badge tone={OFFER_TONES[status]}>{label}</Badge>;
}

const REDEMPTION_TONES: Record<RedemptionStatus, Tone> = {
  reserved: "warning",
  redeemed: "success",
  reversed: "danger",
};

/** Redemption pill: reserved → redeemed on confirm, reversed on cancel/return. */
export function RedemptionStatusBadge({
  status,
  label,
}: {
  status: RedemptionStatus;
  label: string;
}) {
  return <Badge tone={REDEMPTION_TONES[status]}>{label}</Badge>;
}
