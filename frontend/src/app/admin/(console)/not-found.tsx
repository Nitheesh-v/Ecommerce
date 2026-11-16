// src/app/admin/(console)/not-found.tsx

/**
 * Reached through `notFound()` or an unmatched console URL. Kept deliberately
 * small: no client component in the console calls `notFound()` today (each screen
 * renders its own "no such record" state), so this is the safety net for a stale
 * link, not a designed screen.
 */
import Link from "next/link";
import { SearchX } from "lucide-react";

/** A console URL that matches no page — a bad id, or a link from an old export. */
export default function AdminNotFound() {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <SearchX className="h-5 w-5" aria-hidden />
      </span>
      <h1 className="mt-4 text-lg font-semibold text-slate-900">Nothing here</h1>
      <p className="mt-1.5 text-sm text-slate-600">
        This console address does not match a record. The row may have been deleted,
        or the link may be stale.
      </p>
      <Link
        href="/admin/dashboard"
        className="mt-5 inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
      >
        Back to the dashboard
      </Link>
    </div>
  );
}
