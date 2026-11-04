import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

const FIELD_CLASSES =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 " +
  "transition-colors focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 " +
  "disabled:bg-slate-50 disabled:text-slate-500 aria-invalid:border-rose-400 aria-invalid:ring-rose-500/10";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      className={cn(FIELD_CLASSES, className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-slate-700"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
