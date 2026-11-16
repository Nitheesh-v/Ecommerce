// src/components/store/skeletons.tsx

/**
 * Storefront loading skeletons.
 *
 * These exist so a `loading.tsx` can stream a skeleton the instant a link is
 * clicked, instead of leaving the shopper on a blank page while the API answers.
 * Each one mirrors the layout it stands in for — same grid, same aspect ratios —
 * so the real content does not jump when it arrives.
 *
 * The shimmer is `animate-pulse` on cream surfaces: the storefront palette, not
 * the admin console's slate.
 */

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-cream-300 ${className}`} aria-hidden />;
}

/** Shared outer wrapper: announces the wait once, politely. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-10">
      <span className="sr-only">Loading content…</span>
      {children}
    </div>
  );
}

/** Product-page shape: breadcrumb, gallery + buy column, spec card. */
export function ProductPageSkeleton() {
  return (
    <Shell>
      <Bar className="h-3 w-64" />
      <div className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12">
        <div className="space-y-3">
          <div className="animate-pulse rounded-[24px] bg-cream-300" style={{ aspectRatio: "4 / 5" }} />
          <div className="flex gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Bar key={i} className="h-16 w-16 rounded-xl sm:h-20 sm:w-20" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Bar className="h-3 w-24" />
          <Bar className="h-10 w-3/4" />
          <Bar className="h-4 w-32" />
          <Bar className="h-8 w-40" />
          <Bar className="h-12 w-full rounded-xl" />
          <Bar className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    </Shell>
  );
}

/** Catalogue shape: heading, filter rail, grid of cards. */
export function CatalogueSkeleton({ cards = 12 }: { cards?: number }) {
  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Bar className="h-6 w-48" />
          <Bar className="h-3 w-56" />
        </div>
        <Bar className="h-9 w-40 rounded-lg" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
        <div className="hidden space-y-4 rounded-xl border border-cream-300 bg-cream-50 p-4 lg:block">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Bar className="h-3 w-24" />
              <Bar className="h-3 w-full" />
              <Bar className="h-3 w-5/6" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {Array.from({ length: cards }, (_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-2xl border border-cream-300 bg-cream-50"
            >
              <div
                className="animate-pulse bg-cream-300"
                style={{ aspectRatio: "4 / 5" }}
              />
              <div className="space-y-2 p-4">
                <Bar className="h-2.5 w-16" />
                <Bar className="h-3.5 w-full" />
                <Bar className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

/** Category index / detail shape: heading plus a wall of tiles. */
export function CategoryPageSkeleton() {
  return (
    <Shell>
      <div className="space-y-2">
        <Bar className="h-7 w-40" />
        <Bar className="h-3 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-2xl border border-cream-300 bg-cream-50"
          >
            <div className="animate-pulse bg-cream-300" style={{ aspectRatio: "1 / 1" }} />
            <div className="space-y-2 p-3">
              <Bar className="h-3 w-2/3" />
              <Bar className="h-2.5 w-16" />
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** Offers shape: heading plus a stack of coupon rows. */
export function OffersPageSkeleton() {
  return (
    <Shell>
      <div className="space-y-2">
        <Bar className="h-7 w-52" />
        <Bar className="h-3 w-80 max-w-full" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-cream-300 bg-cream-50 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <Bar className="h-12 w-12 rounded-xl" />
              <div className="space-y-2">
                <Bar className="h-3.5 w-40" />
                <Bar className="h-3 w-56" />
              </div>
            </div>
            <Bar className="h-9 w-28 rounded-lg" />
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** Account shape: heading, tabs, list rows. */
export function AccountPageSkeleton() {
  return (
    <Shell>
      <div className="space-y-2">
        <Bar className="h-7 w-44" />
        <Bar className="h-3 w-64" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="space-y-2 rounded-2xl border border-cream-300 bg-cream-50 p-4"
          >
            <Bar className="h-9 w-9 rounded-xl" />
            <Bar className="h-3.5 w-32" />
            <Bar className="h-3 w-full" />
          </div>
        ))}
      </div>
    </Shell>
  );
}
