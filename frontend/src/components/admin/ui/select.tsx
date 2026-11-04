import type { SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const CONTROL_CLASSES =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 " +
  "transition-colors focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 " +
  "disabled:bg-slate-50 disabled:text-slate-500 aria-invalid:border-rose-400";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export function Select({ className, invalid, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(CONTROL_CLASSES, "h-[38px] pr-8", className)}
      aria-invalid={invalid || undefined}
      {...props}
    >
      {children}
    </select>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(CONTROL_CLASSES, "min-h-24 resize-y leading-relaxed", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}
