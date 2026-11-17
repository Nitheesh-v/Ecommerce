# Design system — storefront

The storefront has one palette, defined once in `frontend/src/app/globals.css` and used
through Tailwind utilities. No component holds a hex value; changing the brand means
editing the `@theme` block, not thirty files.

## Palette

| Token | Hex | Where it goes |
| --- | --- | --- |
| `cream-50` | `#FDFAF4` | Cards, inputs, toasts — the "paper" a component sits on |
| `cream-100` | `#F8F1E6` | Page background (`--background`), quiet sections |
| `cream-200` | `#F2E8DA` | Image wells, hover fills, the marquee band. This is the reference "cream" |
| `cream-300` | `#E7D9C6` | Every hairline border |
| `cream-400` | `#D4C0A5` | Disabled borders, dividers that need to be seen |
| `bark-950` | `#1F100A` | Headlines, prices |
| `bark-900` | `#3B2418` | Primary text, filled buttons, the footer. The reference "brown" |
| `bark-800` | `#4A2C1D` | Body text on dark surfaces |
| `bark-700` | `#5E3A27` | Nav links, secondary buttons |
| `bark-600` | `#7A5540` | Supporting paragraphs |
| `bark-500` | `#856048` | Metadata, placeholders, struck-through prices |
| `bark-400` | `#B09580` | Decorative icons only — not text |
| `bark-300`/`200` | `#D3C0B1` / `#E7DACC` | Hairlines on dark surfaces |
| `baby-400` | `#8EC5FF` | The only accent: sale badges, the featured pill, the sale CTA. The reference "baby blue" |
| `baby-300` | `#AFD9FF` | Focus rings |
| `baby-700` | `#1D63A5` | Accent text that must pass contrast on cream |

Semantic colours stay semantic and are **not** part of the brand: `emerald` means in
stock / success, `rose` means cancelled / destructive, `amber` means pending. Recolouring
those would cost meaning, so they keep Tailwind's defaults.

### Contrast

`bark-500` is deliberately darker than its nearest swatch (`#9A7862`): it carries
11–13px text and placeholders, and at `#856048` it clears 4.5:1 on `cream-200`, the
darkest surface it ever sits on. `bark-400` never carries text. Accent text uses
`baby-700` (5.9:1 on `cream-50`) rather than `baby-400`, which is a fill colour.

## Buttons

Every primary action in the storefront is the accent colour, not the ink colour:

| Role | Fill | Text | Hover | Disabled |
| --- | --- | --- | --- | --- |
| Primary (add to cart, checkout, sign in, pay, apply) | `baby-400` | `bark-950` | `baby-300` | `baby-200` |
| Secondary (retry, paging, mark all read) | `cream-50` + `cream-300` border | `bark-800` | `cream-100` | 60% opacity |
| Destructive (cancel order, remove) | `rose-600` | `cream-50` | `rose-500` | `rose-300` |

`baby-400` with `bark-950` text is 10:1 — the accent is readable as a button without
darkening it. The shared `Button` (`components/admin/ui/button.tsx`) exposes this as
`variant="accent"`; the console keeps its own neutral `primary`, so the two surfaces
never borrow each other's chrome. Selection states (the chosen address, the current
page, unread counters) stay ink-brown: they mark *what is chosen*, not *what to press*.

## Type

| Role | Face |
| --- | --- |
| UI, body, prices | Geist Sans (`geist` package, self-hosted) |
| Headlines, product names, numerals in the hero | Playfair Display (`@fontsource-variable/playfair-display`, self-hosted, normal + true italic); system serif stack as the first-paint fallback |

Both faces are self-hosted from npm, so there is no request to Google at runtime and
`next build` needs no network — the same reason the project uses the `geist` package
instead of `next/font/google`. The pairing (Playfair Display + a geometric sans) is the
one `ui-ux-pro-max` recommends for editorial e-commerce; see
[`UI-UX-AUDIT.md`](UI-UX-AUDIT.md).

## Surfaces

- **Storefront** — cream paper, brown ink, one blue accent. Sections are separated by
  hairlines and spacing, not by boxes inside boxes. Two surfaces are inverted to ink:
  the sticky navbar (so navigation reads as a frame, and the cream page starts
  underneath it) and the sale band on the landing page (so the scroll has a rhythm).
  Inside the navbar everything is cream — links at `cream-200` and hover on
  `cream-50/10` — except the search pill, which is solid `cream-50` so the placeholder
  stays legible, and the cart/bell counters, which are `baby-400` with `bark-950`.
- **Admin console** — untouched neutral slate. It is a tool, not a shop window; a warm
  theme there would make data harder to scan and would fight the semantic badges.
- **Shared primitives** — `Toaster`, `Price` and the cart/checkout components follow the
  storefront palette because shoppers see them.

## Tokens and the live style guide

Everything above is expressed as tokens in `frontend/src/app/globals.css`, and the tokens
are rendered — not described — at **`/design`** (unlinked, `noindex`). Reviewing a change
means looking at that page instead of arguing about a hex value.

| Token | Value | Used for |
| --- | --- | --- |
| `--radius-control` | `0.75rem` | Buttons, inputs, chips, small toggles |
| `--radius-surface` | `1rem` | Cards, panels, list rows |
| `--radius-media` | `1.5rem` | Images, hero frames, the gallery stage |
| `--shadow-soft` | warm 2-layer shadow | Resting elevation on a floating surface |
| `--shadow-lift` | warm 2-layer shadow, wider | Hover and modals |
| `--text-eyebrow` | `11px / 1.2 / 0.18em` | The label above a heading |
| `--spacing-section` | `4.5rem` | Vertical rhythm between page sections |

Three component classes carry the shared grammar, so a card and a badge cannot drift
apart:

- **`.surface`** — hairline border on `cream-50` at `--radius-surface`. The one definition
  of "a card".
- **`.surface-hover`** — 2px lift, border darkening and `--shadow-lift` over 220ms; the
  transform is dropped under `prefers-reduced-motion`. Product and category cards use both.
- **`.eyebrow`** — the uppercase tracking label. Replaces a dozen hand-rolled
  `text-[10px] tracking-[0.2em] uppercase` variants.
- **`.rule`** — the hairline between sections.

The rules behind them, taken from `ui-ux-pro-max` and recorded in
[`UI-UX-AUDIT.md`](UI-UX-AUDIT.md):

1. **One accent.** `baby-400` fills, `baby-700` text, `baby-300` rings and hovers.
   Selection states stay brown on purpose.
2. **Elevation is a shadow plus a hairline — never a gradient.**
3. **Radii are role-based, not taste-based.** A control never gets a 24px corner.
4. **Status is never colour alone.** Every badge carries a word.
5. **Motion is 200–250ms for interaction, 300–450ms for entrance,** and all of it stops
   under `prefers-reduced-motion`.

## Motion

All CSS-only, all disabled under `prefers-reduced-motion`, and none of it required to
read the page:

| Utility | What it does | Where |
| --- | --- | --- |
| `animate-rise` | 620ms fade-and-lift on first paint | Hero copy and collage |
| `animate-float` | 9s bob, staggered per card by inline `animationDelay` | Hero collage cards, rating chip |
| `animate-hue` | 22s drift-and-scale | The gradient wash behind the hero, the glow in the sale band |
| `animate-drift` | 38s horizontal marquee | The statement band under the hero |
| `reveal` | `animation-timeline: view()` — fades a section up as it enters the viewport | Every major landing section |

`reveal` lives behind `@supports (animation-timeline: view())`, so browsers without
scroll-driven animations see finished, visible content rather than a blank page. There
is no intersection observer and no animation library; the page is complete before
JavaScript runs.

### 3D, and why it is split in two

The landing page also has depth, on a different footing from the motion above: real
`perspective`, not a bigger `translateY`. It is deliberately built from **two**
mechanisms, because they answer different questions and have different costs.

| | Mechanism | Needs JS? | Where |
| --- | --- | --- | --- |
| **Depth** | `.scene` sets `perspective`; cards sit at different `translateZ`, base `rotateY` and bob speeds via `--depth` / `--bob-ry` / `--bob-lift`, animated by `.animate-depth` | No | Hero collage (three cards + a chip at 120px), the sale band's three tiles |
| **Parallax** | `.tilt` + `.glare` read `--tilt-x` / `--tilt-y` / `--tilt-intensity`, which `usePointerTilt` writes from the pointer position | Yes, and only on a fine pointer | Category tiles, sale tiles, hero cards, the promise strip |

The split is the point. The composition that reads as 3D is pure CSS and is already
correct in the server HTML, so a slow connection, a disabled `script` tag or a crawler
still gets the arranged page. The pointer parallax is an enhancement on top: absent its
custom properties, `.tilt` resolves to the identity transform (`--tilt-scale` defaults
to `0`), so there is no half-applied state to fall back *from*.

Three rules keep it from turning into a gimmick:

1. **One transform, composed once.** `.tilt` is the only place a card's `transform` is
   composed — fan geometry (`--fan-ry`, `--fan-z`) first, then the pointer angles. A
   caller must never pass a `transform` utility: two declarations on one element are
   not additive, and which wins depends on cascade-layer order. That produces a fan
   that silently disappears rather than an error.
2. **Perspective per surface, never nested.** Each `TiltSurface` owns its perspective.
   Stacking a second one on an ancestor flattens the inner rotation into a mere skew.
3. **Still is a real state.** `prefers-reduced-motion` removes the animation, the
   transform and the glare; a coarse pointer gets no tilt at all. The `.glare` is
   `aria-hidden`, `pointer-events-none`, and repeats the card's radius rather than
   inheriting it, because it is a *sibling* of the card and `border-radius: inherit`
   would resolve against the frame's zero radius.

## Landing page sections

`src/app/(store)/page.tsx` composes them; the heavier ones live in
`components/store/home/`:

1. **Hero** — eyebrow, serif headline, search, two CTAs, three live figures (products,
   categories, in stock) and the `HeroCollage` (three real product photographs, floating).
2. **Marquee** — a drifting band of true statements plus the catalogue's own brands.
3. **Promise strip** — four hairline cells (live stock, server pricing, verified
   reviews, COD/secure checkout).
4. **Category showcase** — four tall photographic tiles.
5. **Sale band** — the inverted panel; the discount headline is computed from the deals.
6. **Deals rail** → **Lookbook** (asymmetric mosaic of catalogue photography) →
   **Top rated rail**.
7. **Stats band** — four counts from the public facets endpoint.
8. **New arrivals** and **Handpicked** rails.
9. **FAQ** — native `<details>`, answers derived from how the store actually behaves.
10. **Support band** — phone and email from the public settings document.

Each section is optional: it renders only when the data behind it exists, so an empty or
unreachable API leaves a shorter page, never a broken one.

## Adding to it

Use the tokens — `bg-cream-50`, `text-bark-900`, `border-cream-300`, `bg-baby-400`. If a
new shade is genuinely needed, add it to `@theme` in `globals.css` and to the table
above, so the palette stays a list rather than an accident.
