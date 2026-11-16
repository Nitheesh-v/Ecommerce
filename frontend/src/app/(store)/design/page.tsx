// src/app/(store)/design/page.tsx

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design system",
  description: "Internal style guide for the Ecommerce26 storefront.",
  robots: { index: false, follow: false },
};

/**
 * The storefront's style guide.
 *
 * It renders the real tokens — the palette, the type ramp, the three radii, the two
 * shadows and every control state — so a review is a page visit instead of a
 * conversation. Nothing here is a mock: every class is the one components use.
 *
 * Deliberately unlinked and `noindex`: it is a reference, not a route a shopper
 * should ever land on.
 */

const PAPER = [
  ["cream-50", "#fdfaf4"],
  ["cream-100", "#f8f1e6"],
  ["cream-200", "#f2e8da"],
  ["cream-300", "#e7d9c6"],
  ["cream-400", "#d4c0a5"],
] as const;

const INK = [
  ["bark-950", "#1f100a"],
  ["bark-900", "#3b2418"],
  ["bark-800", "#4a2c1d"],
  ["bark-700", "#5e3a27"],
  ["bark-600", "#7a5540"],
  ["bark-500", "#856048"],
  ["bark-400", "#b09580"],
  ["bark-300", "#d3c0b1"],
] as const;

const ACCENT = [
  ["baby-50", "#f2f8ff"],
  ["baby-100", "#e2f0ff"],
  ["baby-200", "#c6e3ff"],
  ["baby-300", "#afd9ff"],
  ["baby-400", "#8ec5ff"],
  ["baby-500", "#5faef6"],
  ["baby-600", "#2e86d8"],
  ["baby-700", "#1d63a5"],
] as const;

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  const id = title.toLowerCase().replace(/[^a-z]+/g, "-");

  return (
    <section aria-labelledby={id} className="rule pt-8">
      <h2 id={id} className="font-display text-2xl text-bark-950">
        {title}
      </h2>
      {note ? <p className="mt-1 max-w-prose text-xs text-bark-500">{note}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Ramp({
  name,
  steps,
}: {
  name: string;
  steps: readonly (readonly [string, string])[];
}) {
  return (
    <div>
      <p className="eyebrow">{name}</p>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {steps.map(([token, hex]) => (
          <li key={token} className="surface overflow-hidden">
            <span
              className="block h-14 w-full"
              style={{ backgroundColor: hex }}
              aria-hidden
            />
            <span className="block px-2 py-1.5">
              <span className="block text-[11px] font-medium text-bark-900">{token}</span>
              <span className="block font-mono text-[10px] text-bark-500">{hex}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DesignPage() {
  return (
    <div className="space-y-10 py-4">
      <header>
        <p className="eyebrow">Internal reference</p>
        <h1 className="font-display mt-2 text-4xl leading-tight text-bark-950 sm:text-5xl">
          Storefront style guide
        </h1>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-bark-600">
          Every value below is a token in <code className="font-mono text-xs">globals.css</code>{" "}
          or a component class. Cream paper, espresso ink, one baby-blue accent, and
          Playfair Display for anything that should feel spoken rather than typed.
        </p>
      </header>

      <Section
        title="Colour"
        note="Paper is the page, ink is the text, baby blue is the only accent. Filled primary buttons are baby-400 with bark-950 text (≈10:1)."
      >
        <div className="space-y-5">
          <Ramp name="Paper" steps={PAPER} />
          <Ramp name="Ink" steps={INK} />
          <Ramp name="Accent" steps={ACCENT} />
        </div>
      </Section>

      <Section
        title="Typography"
        note="Playfair Display for display and product names; Geist Sans for everything that has to be read at 12px."
      >
        <div className="surface space-y-4 p-6">
          <p className="eyebrow">Eyebrow · 11px · 0.18em</p>
          <p className="font-display text-5xl leading-[1.05] text-bark-950">
            An editorial serif sets the tone.
          </p>
          <p className="font-display text-2xl text-bark-900">Section heading · 24px</p>
          <p className="text-sm leading-relaxed text-bark-600">
            Body copy at 14px with relaxed leading. Long-form text stays under{" "}
            <span className="font-mono text-xs">max-w-prose</span> so a line never runs
            past a comfortable 70 characters.
          </p>
          <p className="text-xs text-bark-500">
            Secondary copy at 12px, bark-500 — the darkest ink that still passes AA on
            cream-200.
          </p>
          <p className="font-mono text-xs text-bark-800">SKU-0001-A · monospace for codes</p>
        </div>
      </Section>

      <Section
        title="Radii and elevation"
        note="Three radii, one per role. Elevation is a warm shadow with a hairline; there are no gradients in this UI."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["rounded-control", "12px · buttons, inputs, chips"],
            ["rounded-surface", "16px · cards, panels"],
            ["rounded-media", "24px · images, hero frames"],
          ].map(([token, use]) => (
            <div key={token} className="rounded-surface border border-cream-300 bg-cream-50 p-4">
              <div
                className={`h-16 w-full bg-cream-200 ${token === "rounded-control" ? "rounded-xl" : token === "rounded-surface" ? "rounded-2xl" : "rounded-3xl"}`}
                aria-hidden
              />
              <p className="mt-3 font-mono text-[11px] text-bark-900">{token}</p>
              <p className="text-[11px] text-bark-500">{use}</p>
            </div>
          ))}
          <div className="rounded-surface border border-cream-300 bg-cream-50 p-4 shadow-soft">
            <div className="h-16 w-full rounded-xl bg-cream-200" aria-hidden />
            <p className="mt-3 font-mono text-[11px] text-bark-900">shadow-soft</p>
            <p className="text-[11px] text-bark-500">resting elevation</p>
          </div>
        </div>
      </Section>

      <Section
        title="Buttons"
        note="Blue is the primary action, everywhere. Brown stays for selection states. Every button is a real 40px target with a visible focus ring and a loading state that disables it."
      >
        <div className="surface flex flex-wrap items-center gap-3 p-6">
          <button className="cursor-pointer rounded-control bg-baby-400 px-4 py-2.5 text-sm font-semibold text-bark-950 transition-colors hover:bg-baby-300">
            Primary
          </button>
          <button className="cursor-pointer rounded-control border border-bark-300 px-4 py-2.5 text-sm font-semibold text-bark-900 transition-colors hover:bg-cream-100">
            Secondary
          </button>
          <button className="cursor-pointer rounded-control px-4 py-2.5 text-sm font-semibold text-bark-800 transition-colors hover:bg-cream-100">
            Ghost
          </button>
          <button className="cursor-pointer rounded-control bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-500">
            Destructive
          </button>
          <button
            disabled
            className="cursor-not-allowed rounded-control bg-baby-200 px-4 py-2.5 text-sm font-semibold text-bark-500 opacity-70"
          >
            Disabled
          </button>
          <button className="cursor-default rounded-control bg-baby-400 px-4 py-2.5 text-sm font-semibold text-bark-950 opacity-80">
            Saving…
          </button>
        </div>
      </Section>

      <Section
        title="Fields"
        note="Labels sit above the input, hints and errors sit below it, and an error is announced with role=alert and described by aria-describedby."
      >
        <div className="surface grid gap-5 p-6 sm:grid-cols-2">
          <div>
            <label htmlFor="d-name" className="block text-xs font-medium text-bark-800">
              Full name
            </label>
            <input
              id="d-name"
              defaultValue="Meera Raghavan"
              className="mt-1.5 h-10 w-full rounded-control border border-cream-300 bg-cream-50 px-3 text-sm text-bark-900 placeholder:text-bark-400 focus:border-bark-400 focus:ring-2 focus:ring-baby-300 focus:outline-none"
            />
            <p className="mt-1.5 text-[11px] text-bark-500">As it should appear on the parcel.</p>
          </div>

          <div>
            <label htmlFor="d-phone" className="block text-xs font-medium text-bark-800">
              Phone
            </label>
            <input
              id="d-phone"
              defaultValue="98"
              aria-invalid
              aria-describedby="d-phone-error"
              className="mt-1.5 h-10 w-full rounded-control border border-rose-400 bg-cream-50 px-3 text-sm text-bark-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-200 focus:outline-none"
            />
            <p id="d-phone-error" role="alert" className="mt-1.5 text-[11px] font-medium text-rose-700">
              Enter the 10-digit mobile number the courier will call.
            </p>
          </div>

          <div>
            <label htmlFor="d-disabled" className="block text-xs font-medium text-bark-400">
              Coupon
            </label>
            <input
              id="d-disabled"
              disabled
              placeholder="Add an item to apply a code"
              className="mt-1.5 h-10 w-full cursor-not-allowed rounded-control border border-cream-300 bg-cream-100 px-3 text-sm text-bark-400"
            />
          </div>

          <div>
            <label htmlFor="d-select" className="block text-xs font-medium text-bark-800">
              State
            </label>
            <select
              id="d-select"
              className="mt-1.5 h-10 w-full cursor-pointer rounded-control border border-cream-300 bg-cream-50 px-3 text-sm text-bark-900 focus:border-bark-400 focus:ring-2 focus:ring-baby-300 focus:outline-none"
            >
              <option>Tamil Nadu</option>
              <option>Karnataka</option>
              <option>Kerala</option>
            </select>
          </div>
        </div>
      </Section>

      <Section
        title="Badges and status"
        note="Status is never colour alone: each badge carries a word."
      >
        <div className="surface flex flex-wrap items-center gap-2 p-6">
          <span className="rounded-full bg-baby-400 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-bark-950 uppercase">
            20% off
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
            In stock
          </span>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700">
            Sold out
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
            Pending
          </span>
          <span className="rounded-full border border-bark-300 px-2.5 py-1 text-[11px] font-medium text-bark-800">
            Default address
          </span>
        </div>
      </Section>

      <Section
        title="Surfaces"
        note="A card is a hairline, a cream fill and a soft shadow. Hover lifts it 2px — the only movement in a list."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="surface surface-hover p-5">
            <p className="eyebrow">Hover me</p>
            <p className="font-display mt-1 text-lg text-bark-950">Product card</p>
            <p className="mt-1 text-xs text-bark-500">surface + surface-hover</p>
          </div>
          <div className="surface p-5">
            <p className="eyebrow">Static</p>
            <p className="font-display mt-1 text-lg text-bark-950">Panel</p>
            <p className="mt-1 text-xs text-bark-500">surface</p>
          </div>
          <div className="rounded-surface border border-cream-300 bg-cream-100 p-5">
            <p className="eyebrow">Muted</p>
            <p className="font-display mt-1 text-lg text-bark-950">Well</p>
            <p className="mt-1 text-xs text-bark-500">cream-100 fill</p>
          </div>
        </div>
      </Section>

      <Section
        title="Rhythm"
        note="Sections are separated by 4.5rem on large screens and a hairline rule. Nothing invents its own spacing."
      >
        <div className="space-y-2">
          {[16, 24, 40, 64].map((size) => (
            <div key={size} className="flex items-center gap-3">
              <span className="w-14 font-mono text-[11px] text-bark-500">{size}px</span>
              <span
                className="h-3 rounded-full bg-baby-200"
                style={{ width: `${size * 4}px` }}
                aria-hidden
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
