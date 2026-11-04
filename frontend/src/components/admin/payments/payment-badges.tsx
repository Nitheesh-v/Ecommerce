import { Badge } from "@/components/admin/ui/badge";
import type { PaymentMethod, PaymentStatus } from "@/types/payment";
import { PAYMENT_METHOD_LABELS } from "@/types/payment";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

/**
 * Tones for the *transaction* lifecycle.
 *
 * Deliberately separate from the order payment badge: a captured transaction is
 * "money in", while `refunded` is neutral (the sale stands, the money went back).
 */
const PAYMENT_TONES: Record<PaymentStatus, Tone> = {
  pending: "warning",
  authorized: "info",
  captured: "success",
  failed: "danger",
  cancelled: "neutral",
  partially_refunded: "accent",
  refunded: "neutral",
};

const LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  authorized: "Authorized",
  captured: "Captured",
  failed: "Failed",
  cancelled: "Cancelled",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

export function TransactionStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={PAYMENT_TONES[status] ?? "neutral"}>{LABELS[status] ?? status}</Badge>;
}

export function PaymentMethodLabel({ method }: { method: PaymentMethod }) {
  return (
    <span className="text-sm text-slate-700">
      {PAYMENT_METHOD_LABELS[method] ?? method}
    </span>
  );
}

/**
 * Shows whether an outcome was confirmed by the gateway.
 *
 * "Verified" is the whole point of the payments console: a status that came from
 * anything other than the gateway must be visibly distinguishable.
 */
export function GatewayTrustBadge({
  verified,
  signatureVerified,
}: {
  verified: boolean;
  signatureVerified: boolean;
}) {
  if (verified) {
    return <Badge tone="success">Gateway verified</Badge>;
  }
  if (signatureVerified) {
    return <Badge tone="warning">Signature only</Badge>;
  }

  return <Badge tone="neutral">Unverified</Badge>;
}

export function RefundStatusBadge({
  status,
}: {
  status: "pending" | "processed" | "failed";
}) {
  const tone: Tone =
    status === "processed" ? "success" : status === "pending" ? "warning" : "danger";

  return (
    <Badge tone={tone}>
      {status === "processed" ? "Processed" : status === "pending" ? "Pending" : "Failed"}
    </Badge>
  );
}
