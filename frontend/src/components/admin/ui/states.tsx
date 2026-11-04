import { AlertTriangle, RefreshCw, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-200/70", className)}
      aria-hidden
    />
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs text-slate-500">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-rose-600"
          aria-hidden
        />
        <p className="text-sm text-rose-800">{message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Retry
        </button>
      ) : null}
    </div>
  );
}
