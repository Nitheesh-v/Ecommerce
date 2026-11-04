import { CircleDot } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { ShipmentEvent } from "@/types/shipment";

/**
 * Append-only shipment history, newest first.
 *
 * Read-only by design: an event is a record of something that happened, so there
 * is no edit or delete control anywhere in the console.
 */
export function ShipmentTimeline({ events }: { events: ShipmentEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-slate-500">
        Nothing has happened on this shipment yet.
      </p>
    );
  }

  return (
    <ol className="space-y-4 px-5 py-4">
      {events.map((event) => (
        <li key={event.id} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <CircleDot className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">{event.label}</p>
              <time
                className="text-xs text-slate-500"
                dateTime={event.at}
                title={new Date(event.at).toISOString()}
              >
                {formatDateTime(event.at)}
              </time>
            </div>
            {event.reason ? (
              <p className="mt-0.5 text-xs text-slate-700">{event.reason}</p>
            ) : null}
            {event.note ? (
              <p className="mt-0.5 text-xs text-slate-500">{event.note}</p>
            ) : null}
            <p className="mt-0.5 text-[11px] text-slate-400">
              {event.source === "admin"
                ? `by ${event.by ?? "an administrator"}`
                : event.source === "courier"
                  ? "from the courier"
                  : "by the system"}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
