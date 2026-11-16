// src/components/store/auth/auth-shell.tsx

/**
 * The shared frame for sign-in and sign-up.
 *
 * Both screens were a lonely card in a max-w-md column: no reason to trust the
 * store, nothing to do if the page is not what you wanted. This gives them the
 * storefront palette, a marketing rail that says why an account is worth having,
 * and a quiet way out ("keep browsing") — which is the single most common action
 * on a sign-in page a shopper did not mean to reach.
 *
 * Layout: one column on phones, form + rail side by side from `lg`.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Heart, PackageCheck, ShieldCheck, Ticket } from "lucide-react";

const REASONS = [
  {
    icon: PackageCheck,
    title: "Every order, in one place",
    copy: "Live status, invoices and reorder links — no email archaeology.",
  },
  {
    icon: Ticket,
    title: "Offers applied automatically",
    copy: "Coupons are priced by the store, so the total you see is the total you pay.",
  },
  {
    icon: Heart,
    title: "Saved addresses and reviews",
    copy: "Check out in two taps, and rate only what you actually received.",
  },
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="mx-auto grid w-full max-w-5xl items-start gap-8 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-14">
      <div>
        <Link
          href="/products"
          className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-bark-600 transition-colors hover:text-bark-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Keep browsing
        </Link>

        <div className="rounded-2xl border border-cream-300 bg-cream-50 p-6 shadow-soft sm:p-8">
          <h1 className="font-display text-2xl leading-tight text-bark-950">{title}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-bark-600">{subtitle}</p>

          <div className="mt-6">{children}</div>

          <div className="mt-6 border-t border-cream-300 pt-4 text-sm text-bark-700">
            {footer}
          </div>
        </div>

        <p className="mt-4 flex items-start gap-2 px-1 text-[11px] leading-relaxed text-bark-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Your password is stored only as a bcrypt hash on the server, and the session
          lives in an HttpOnly cookie — never in this browser&rsquo;s storage.
        </p>
      </div>

      {/* The rail is context, not a form — hidden on small screens to keep the funnel short. */}
      <aside className="hidden rounded-2xl border border-cream-300 bg-cream-200/60 p-8 lg:block">
        <p className="text-[11px] font-semibold tracking-[0.24em] text-bark-500 uppercase">
          Why an account
        </p>
        <ul className="mt-6 space-y-6">
          {REASONS.map(({ icon: Icon, title: reason, copy }) => (
            <li key={reason} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cream-50 text-bark-700">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-bark-900">{reason}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-bark-600">{copy}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-8 border-t border-cream-400/60 pt-5 text-xs leading-relaxed text-bark-600">
          No spam, no newsletters you did not ask for. We email you about an order and
          nothing else.
        </p>
      </aside>
    </div>
  );
}
