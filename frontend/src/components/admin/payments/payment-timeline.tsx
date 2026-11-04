import { CircleDot } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { PaymentTimelineEntry } from "@/types/payment";

/**
 * Event timeline.
 *
 * Merges the payment's own event log (webhook / verification) with the order's
 * payment and refund history, newest first. Read-only: this is the audit trail,
 * not something the console edits.
 */
export function PaymentTimeline({ entries }: { entries: PaymentTimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-slate-500">
        Nothing has happened on this transaction yet.
      </p>
    );
  }

  return (
    <ol className="space-y-4 px-5 py-4">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <CircleDot className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">{entry.label}</p>
              <time
                className="text-xs text-slate-500"
                dateTime={entry.at}
                title={new Date(entry.at).toISOString()}
              >
                {formatDateTime(entry.at)}
              </time>
            </div>
            {entry.detail ? (
              <p className="mt-0.5 text-xs text-slate-600">{entry.detail}</p>
            ) : null}
            {entry.actor ? (
              <p className="mt-0.5 text-[11px] text-slate-400">by {entry.actor}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
