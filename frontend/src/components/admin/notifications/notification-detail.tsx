"use client";

// src/components/admin/notifications/notification-detail.tsx

import { useRouter } from "next/navigation";
import { Check, ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Dialog } from "@/components/admin/ui/dialog";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils";
import { adminNotificationsService } from "@/services/admin/notifications.service";
import type { AdminNotificationItem } from "@/types/notification";
import { EmailStatusBadge } from "./email-status-badge";

/**
 * One notification, with the email that was (or was not) sent.
 *
 * The retry button is the only write here: an operator re-sends a message the relay
 * rejected. The API refuses when SMTP is unconfigured or the mail was already
 * delivered, and that refusal is shown verbatim — a button that always "works" would
 * teach the team nothing.
 */
export function NotificationDetail({
  item,
  open,
  onClose,
  onChanged,
}: {
  item: AdminNotificationItem | null;
  open: boolean;
  onClose: () => void;
  onChanged: (item: AdminNotificationItem) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"read" | "retry" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (kind: "read" | "retry") => {
    if (!item) {
      return;
    }

    setBusy(kind);
    setError(null);

    try {
      const updated =
        kind === "read"
          ? await adminNotificationsService.markRead(item.id)
          : await adminNotificationsService.retry(item.id);

      onChanged(updated);
    } catch (actionError) {
      setError(getApiErrorMessage(actionError));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={item?.title ?? "Notification"}
      description={item ? `${item.type} · ${formatDateTime(item.createdAt)}` : undefined}
      footer={
        item ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Email:</span>
              <EmailStatusBadge status={item.emailStatus} />
              <span>· {item.attempts} attempt{item.attempts === 1 ? "" : "s"}</span>
            </div>
            <div className="flex gap-2">
              {!item.read ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void act("read")}
                  loading={busy === "read"}
                >
                  <Check className="h-4 w-4" aria-hidden />
                  Mark read
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void act("retry")}
                loading={busy === "retry"}
                disabled={item.emailStatus === "delivered"}
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Retry email
              </Button>
              {item.link ? (
                <Button
                  size="sm"
                  onClick={() => {
                    onClose();
                    router.push(item.link as string);
                  }}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Open
                </Button>
              ) : null}
            </div>
          </div>
        ) : null
      }
    >
      {item ? (
        <div className="space-y-4">
          {error ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-500">Recipient</dt>
              <dd className="text-slate-800">
                {item.recipientName ?? "—"}
                <span className="block text-xs text-slate-500">{item.recipientEmail}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Audience</dt>
              <dd className="text-slate-800">
                {item.audience === "admin" ? "Shop alerts" : "Customer"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Last attempt</dt>
              <dd className="text-slate-800">
                {item.lastAttemptAt ? formatDateTime(item.lastAttemptAt) : "Never"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Delivered at</dt>
              <dd className="text-slate-800">
                {item.emailSentAt ? formatDateTime(item.emailSentAt) : "—"}
              </dd>
            </div>
          </dl>

          {item.emailError ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs font-semibold text-amber-800">Email not delivered</p>
              <p className="mt-0.5 text-xs text-amber-700">{item.emailError}</p>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-medium text-slate-500">Subject</p>
            <p className="text-sm text-slate-800">{item.emailSubject}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500">Message (as sent)</p>
            <pre className="mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-700">
              {item.emailText}
            </pre>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
