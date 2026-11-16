"use client";

// src/app/admin/(console)/error.tsx

/**
 * Console error boundary.
 *
 * Rendered *inside* `AdminShell`, so the sidebar and header stay put and the
 * operator keeps their bearings. It shows what went wrong, the digest the server
 * logged, and a retry — the console is a tool, so honesty beats reassurance here.
 */
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";

export default function AdminConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </span>

      <h1 className="mt-4 text-lg font-semibold text-slate-900">
        This screen could not be loaded
      </h1>
      <p className="mt-1.5 text-sm text-slate-600">
        The request failed before the page could render. Nothing was written, and no
        order or payment was changed by this error.
      </p>

      {error.message ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-left text-xs break-words text-slate-700">
          {error.message}
        </p>
      ) : null}

      {error.digest ? (
        <p className="mt-2 text-[11px] text-slate-500">
          Reference: <span className="font-mono text-slate-700">{error.digest}</span>
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Try again
        </button>
        <a
          href="/admin/dashboard"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Back to the dashboard
        </a>
      </div>
    </div>
  );
}
