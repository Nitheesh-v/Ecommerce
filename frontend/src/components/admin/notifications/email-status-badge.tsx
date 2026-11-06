// src/components/admin/notifications/email-status-badge.tsx

import { Badge } from "@/components/admin/ui/badge";
import type { NotificationEmailStatus } from "@/types/notification";

const LABELS: Record<NotificationEmailStatus, string> = {
  delivered: "Sent",
  skipped: "Skipped",
  failed: "Failed",
  pending: "Pending",
};

const TONES: Record<NotificationEmailStatus, "success" | "neutral" | "danger" | "warning"> = {
  delivered: "success",
  skipped: "neutral",
  failed: "danger",
  pending: "warning",
};

/** The email half of a notification, in one word. */
export function EmailStatusBadge({ status }: { status: NotificationEmailStatus }) {
  return <Badge tone={TONES[status]}>{LABELS[status]}</Badge>;
}
