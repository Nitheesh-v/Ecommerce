"use client";

// src/components/store/auth/password-strength.tsx

/**
 * Strength meter for the sign-up password.
 *
 * The form used to state its rules in a hint ("8+ characters, a letter and a
 * number") and only say what was missing after a submit. This shows the rules as
 * a checklist that ticks as you type, so the password is right before the request
 * is ever sent.
 *
 * It mirrors the zod schema exactly — same thresholds, same messages — and the
 * schema remains the authority: this is feedback, not validation.
 */
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const RULES = [
  { id: "length", label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  { id: "letter", label: "One letter", test: (value: string) => /[A-Za-z]/.test(value) },
  { id: "number", label: "One number", test: (value: string) => /\d/.test(value) },
  { id: "long", label: "At most 72 characters", test: (value: string) => value.length <= 72 },
] as const;

/** `0` empty → `4` all rules met. Used for the bar width and colour. */
function score(value: string): number {
  if (!value) {
    return 0;
  }

  const met = RULES.filter((rule) => rule.test(value)).length;

  // Any single missing rule cannot be a "strong" password, whatever the rest say.
  return met - (met === RULES.length ? 0 : 1);
}

const BAR_TONE = [
  "bg-cream-300",
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-emerald-600",
] as const;

const BAR_LABEL = ["", "Weak", "Fair", "Good", "Strong"] as const;

export function PasswordStrength({ value }: { value: string }) {
  const points = score(value);
  const total = RULES.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-300">
          <div
            className={cn("h-full rounded-full transition-all duration-300", BAR_TONE[points])}
            style={{ width: `${(points / total) * 100}%` }}
          />
        </div>
        <span
          className={cn(
            "w-12 text-right text-[11px] font-medium",
            points === 0 ? "text-bark-400" : "text-bark-700",
          )}
          aria-live="polite"
        >
          {BAR_LABEL[points]}
        </span>
      </div>

      <ul className="grid gap-1 sm:grid-cols-2">
        {RULES.map((rule) => {
          const met = rule.test(value);

          return (
            <li
              key={rule.id}
              className={cn(
                "flex items-center gap-1.5 text-[11px] transition-colors",
                met ? "text-emerald-700" : "text-bark-500",
              )}
            >
              {met ? (
                <Check className="h-3 w-3 shrink-0" aria-hidden />
              ) : (
                <Minus className="h-3 w-3 shrink-0" aria-hidden />
              )}
              {rule.label}
              <span className="sr-only">{met ? " — met" : " — not met yet"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
