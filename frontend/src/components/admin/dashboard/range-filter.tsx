"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardRangeKey } from "@/types/admin";

export interface RangeSelection {
  range: DashboardRangeKey;
  from?: string;
  to?: string;
}

const PRESETS: { key: Exclude<DashboardRangeKey, "custom">; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
];

/** `yyyy-mm-dd` from an `<input type="date">` → ISO instant, or null. */
function toIso(date: string, edge: "start" | "end"): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  const suffix = edge === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
  const parsed = new Date(`${date}${suffix}`);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function RangeFilter({
  value,
  onChange,
  disabled = false,
}: {
  value: RangeSelection;
  onChange: (selection: RangeSelection) => void;
  disabled?: boolean;
}) {
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const applyCustom = () => {
    const from = toIso(customFrom, "start");
    const to = toIso(customTo, "end");

    if (!from || !to) {
      setCustomError("Pick both a start and an end date.");
      return;
    }

    if (from > to) {
      setCustomError("The start date must be before the end date.");
      return;
    }

    setCustomError(null);
    onChange({ range: "custom", from, to });
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Reporting period"
          className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5"
        >
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              disabled={disabled}
              aria-pressed={value.range === preset.key}
              onClick={() => {
                setCustomError(null);
                onChange({ range: preset.key });
              }}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                value.range === preset.key
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            disabled={disabled}
            aria-pressed={value.range === "custom"}
            onClick={() => {
              if (value.range === "custom") {
                applyCustom();
                return;
              }

              setCustomError(null);
              setCustomFrom("");
              setCustomTo("");
              onChange({ range: "custom" });
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              value.range === "custom"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            Custom
          </button>
        </div>
      </div>

      {value.range === "custom" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <label className="flex items-center gap-2 text-xs text-slate-500">
            From
            <input
              type="date"
              value={customFrom}
              max={today}
              onChange={(event) => setCustomFrom(event.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            To
            <input
              type="date"
              value={customTo}
              max={today}
              onChange={(event) => setCustomTo(event.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-slate-400 focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={applyCustom}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800"
          >
            Apply
          </button>
          {customError ? (
            <span className="text-xs text-rose-600" role="alert">
              {customError}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
