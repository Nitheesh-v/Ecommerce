# Design system — storefront

The storefront has one palette, defined once in `frontend/src/app/globals.css` and used
through Tailwind utilities. No component holds a hex value; changing the brand means
editing the `@theme` block, not thirty files.

## Palette

| Token | Hex | Where it goes |
| --- | --- | --- |
| `cream-50` | `#FDFAF4` | Cards, inputs, toasts — the "paper" a component sits on |
| `cream-100` | `#F8F1E6` | Page background (`--background`), quiet sections |
| `cream-200` | `#F1E7D7` | Image wells, hover fills, the marquee band. This is the reference "cream" |
| `cream-300` | `#E6D8C3` | Every hairline border |
| `cream-400` | `#D4C0A5` | Disabled borders, dividers that need to be seen |
| `bark-950` | `#1F100A` | Headlines, prices |
| `bark-900` | `#3A2216` | Primary text, filled buttons, the footer. The reference "brown" |
| `bark-800` | `#4A2C1D` | Body text on dark surfaces |
| `bark-700` | `#5E3A27` | Nav links, secondary buttons |
| `bark-600` | `#7A5540` | Supporting paragraphs |
| `bark-500` | `#856048` | Metadata, placeholders, struck-through prices |
| `bark-400` | `#B09580` | Decorative icons only — not text |
| `bark-300`/`200` | `#D3C0B1` / `#E7DACC` | Hairlines on dark surfaces |
| `baby-400` | `#8CC4FE` | The only accent: sale badges, the featured pill, the sale CTA. The reference "baby blue" |
| `baby-300` | `#A6D4FF` | Focus rings |
| `baby-700` | `#1D63A5` | Accent text that must pass contrast on cream |

Semantic colours stay semantic and are **not** part of the brand: `emerald` means in
stock / success, `rose` means cancelled / destructive, `amber` means pending. Recolouring
those would cost meaning, so they keep Tailwind's defaults.

### Contrast

`bark-500` is deliberately darker than the swatch it came from (`#9A7862`): it carries
11–13px text and placeholders, and at `#856048` it clears 4.5:1 on `cream-200`, the
darkest surface it ever sits on. `bark-400` never carries text. Accent text uses
`baby-700` (5.9:1 on `cream-50`) rather than `baby-400`, which is a fill colour.

## Type

| Role | Face |
| --- | --- |
| UI, body, prices | Geist Sans (`geist` package, self-hosted) |
| Headlines, product names, numerals in the hero | `--font-display`: Iowan Old Style → Palatino → Georgia → serif |

The display face is a system stack on purpose: no webfont request, no layout shift, and
`next build` needs no network — the same reason the project self-hosts Geist instead of
using `next/font/google`.

## Surfaces

- **Storefront** — cream paper, brown ink, one blue accent. Sections are separated by
  hairlines and spacing, not by boxes inside boxes. The only inverted surface on the
  landing page is the sale band (`bark-900`), which exists to stop the page reading as
  one flat scroll.
- **Admin console** — untouched neutral slate. It is a tool, not a shop window; a warm
  theme there would make data harder to scan and would fight the semantic badges.
- **Shared primitives** — `Toaster`, `Price` and the cart/checkout components follow the
  storefront palette because shoppers see them.

## Motion

Three animations, all CSS-only and all disabled under `prefers-reduced-motion`:
`animate-rise` (the hero), `animate-drift` (the statement marquee) and the order
confirmation's checkmark. Nothing animates on scroll and nothing depends on JavaScript
to become visible.

## Adding to it

Use the tokens — `bg-cream-50`, `text-bark-900`, `border-cream-300`, `bg-baby-400`. If a
new shade is genuinely needed, add it to `@theme` in `globals.css` and to the table
above, so the palette stays a list rather than an accident.
