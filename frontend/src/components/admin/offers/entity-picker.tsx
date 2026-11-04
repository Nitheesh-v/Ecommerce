"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/admin/ui/input";

export interface PickerOption {
  id: string;
  name: string;
  hint?: string;
}

/**
 * Multi-select for eligibility lists.
 *
 * A scrollable checkbox list with a local filter — the catalogues here are small
 * and already loaded, so there is no request per keystroke. Selected items are
 * listed as removable chips above the list.
 */
export function EntityPicker({
  label,
  hint,
  options,
  selected,
  onChange,
  emptyLabel,
  idPrefix,
}: {
  label: string;
  hint?: string;
  options: PickerOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyLabel: string;
  idPrefix: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return options;
    }

    return options.filter((option) =>
      `${option.name} ${option.hint ?? ""}`.toLowerCase().includes(term),
    );
  }, [options, search]);

  const selectedOptions = options.filter((option) => selected.includes(option.id));

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((entry) => entry !== id)
        : [...selected, id],
    );
  };

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-medium text-slate-700">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      </div>

      {selectedOptions.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {selectedOptions.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => toggle(option.id)}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-100 hover:bg-indigo-100"
                aria-label={`Remove ${option.name}`}
              >
                {option.name}
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Search ${label.toLowerCase()}…`}
          aria-label={`Search ${label.toLowerCase()}`}
          aria-controls={`${idPrefix}-options`}
          className="pl-8 text-sm"
        />
      </div>

      <div
        id={`${idPrefix}-options`}
        className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2"
      >
        {filtered.length === 0 ? (
          <p className="px-1 py-2 text-xs text-slate-500">{emptyLabel}</p>
        ) : (
          filtered.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                onChange={() => toggle(option.id)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="min-w-0">
                <span className="block truncate text-slate-800">{option.name}</span>
                {option.hint ? (
                  <span className="block truncate text-xs text-slate-500">
                    {option.hint}
                  </span>
                ) : null}
              </span>
            </label>
          ))
        )}
      </div>

      <p className="text-xs text-slate-500">
        {selected.length === 0 ? "All apply" : `${selected.length} selected`}
      </p>
    </div>
  );
}
