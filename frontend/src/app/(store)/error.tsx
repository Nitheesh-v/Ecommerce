"use client";

// src/app/(store)/error.tsx

/**
 * Storefront error boundary.
 *
 * Without this, a thrown server error replaced the page with Next's default
 * black-on-white error screen — off-brand, and with no way back. This keeps the
 * shopper inside the store chrome (the `(store)` layout still renders) and offers
 * the two things that actually help: retry the segment, or browse the catalogue.
 *
 * The message is deliberately generic. The API's real error is already logged by
 * the request-id-carrying logger on the server; leaking an internal message to a
 * shopper is noise at best and information disclosure at worst.
 */
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </span>

      <h1 className="font-display mt-5 text-2xl text-bark-950">
        Something went wrong at our end
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-bark-600">
        This page could not be loaded. Nothing you did caused it, and no order or
        payment was placed. Trying again usually works.
      </p>

      {error.digest ? (
        // The digest is the server's own reference for this error — safe to show,
        // and the only thing that lets support find the matching log line.
        <p className="mt-3 text-[11px] text-bark-500">
          Reference: <span className="font-mono text-bark-700">{error.digest}</span>
        </p>
      ) : null}

      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-baby-400 px-4 py-2 text-sm font-semibold text-bark-950 transition-colors hover:bg-baby-300"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cream-300 px-4 py-2 text-sm font-medium text-bark-800 transition-colors hover:bg-cream-100"
        >
          <Home className="h-3.5 w-3.5" aria-hidden />
          Back to the shop
        </Link>
      </div>
    </div>
  );
}
