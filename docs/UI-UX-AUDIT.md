# UI/UX audit — against `ui-ux-pro-max`

This storefront's interface was reviewed against
[`nextlevelbuilder/ui-ux-pro-max-skill`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
(MIT, v2.15.0): a searchable design database — 80 UI styles, 192 palettes, 74 font
pairings, 120 UX rules, 25 landing patterns and per-stack guidance — queried from the
command line. It is a *reference*, not a dependency: nothing from it ships in the app.

## How it was queried

```bash
git clone --depth 1 https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git /tmp/ui-ux-pro-max-skill
cd /tmp/ui-ux-pro-max-skill

python3 src/ui-ux-pro-max/scripts/search.py "e-commerce storefront" --domain product
python3 src/ui-ux-pro-max/scripts/search.py "premium editorial beauty ecommerce" \
  --design-system --variance 6 --motion 5 --density 5
python3 src/ui-ux-pro-max/scripts/search.py "editorial serif premium ecommerce" --domain typography
python3 src/ui-ux-pro-max/scripts/search.py "accessibility focus keyboard contrast" --domain ux
python3 src/ui-ux-pro-max/scripts/search.py "image optimization fonts app router" --stack nextjs
```

The tool reports its own misses (a query with no database match says so rather than
answering from nothing), which is why the landing-pattern query was re-run as
`Hero-Centric + Conversion` — it resolves to `funnel-3-step-conversion`.

## What it recommended, and what was taken

| Recommendation | Decision |
| --- | --- |
| Product type: **E-commerce Luxury** → style *Liquid Glass + Glassmorphism / Aurora*, palette *premium black + gold* | **Rejected.** A translucent, glassy shop suits app chrome, not a small catalogue, and it fights the cream/brown/baby-blue swatches the shop was asked to use. |
| Typography: **Playfair Display / Inter** — "elegant, luxury, editorial, high-end e-commerce" | **Adopted.** Playfair Display is now the display face, self-hosted via `@fontsource-variable/playfair-display` (normal + true italic) so builds need no network. |
| Landing pattern: **Feature-Rich Showcase** — hero, feature grid, benefits, social proof, repeated CTA | **Adopted in structure.** Hero → promise strip → categories → sale band → rails → lookbook → stats → FAQ → support. |
| Motion: **stagger 300–450ms, `prefers-reduced-motion` respected** | **Adopted in principle, implemented in CSS** (no GSAP): `animate-rise`, `animate-float`, `reveal`. |
| "No emojis as icons — use SVG (Lucide)" | Already true; every icon is Lucide with `aria-hidden`. |

## Findings in this codebase

| Rule (severity) | State before | Action |
| --- | --- | --- |
| **Focus not obscured by sticky UI** (AA, High) | The sticky header could cover an element reached by anchor jump or keyboard focus | **Fixed** — `scroll-padding-top: 5.5rem` on `html` |
| **Active navigation state** (Medium) | All header links looked identical; nothing marked the current section | **Fixed** — `StoreNavLinks` marks the active item three ways: background, a baby-blue inset bar and `aria-current="page"` |
| **Skip link** (accessibility) | None — keyboard users tabbed through the whole header on every page | **Fixed** — skip-to-content link, focusable `<main>` |
| **`cursor-pointer` on clickable elements** (pre-delivery checklist) | Tailwind v4 no longer sets it on `<button>`; the shared `Button` had none | **Fixed** — added to `Button` |
| **Focus appearance** — 2px perimeter, 3:1 contrast | Global `:focus-visible` outline exists (2px `baby-600`) | Already compliant; documented in `DESIGN-SYSTEM.md` |
| **Contrast AA on secondary copy** | `bark-500` was below 4.5:1 on cream | Previously fixed: darkened to `#856048` (4.56:1 on `cream-200`) |
| **`next/image` for all images** (High) | Plain `<img>` with explicit `eslint-disable` comments throughout | **Open** — see below |
| **Responsive `srcset`** (Performance, High) | `sizes` set on the hero collage only; no `srcset` | **Open** — follows from the same fix |
| **Reduced motion** | Every keyframe utility is disabled under `prefers-reduced-motion` | Already compliant |

## Second pass — cart and checkout

Same procedure, different screens:

```bash
python3 src/ui-ux-pro-max/scripts/search.py "form validation error messages checkout" --domain ux
python3 src/ui-ux-pro-max/scripts/search.py "cart empty state feedback" --domain ux
python3 src/ui-ux-pro-max/scripts/search.py "loading disabled submit button" --domain ux
```

| Rule (severity) | State | Action |
| --- | --- | --- |
| **Error messages must be announced** (High) | Nearly every surface already used `role="alert"`; the address form's per-field errors were visual only | **Fixed** — each field error is now `role="alert"` and wired to its input with `aria-describedby` + `aria-invalid` |
| **Focusable error summary** (High) | Checkout, sign-in and sign-up announced their errors but never focused them; on mobile the message sits above the button, off-screen after a failed submit | **Fixed** — a failed place-order and a failed sign-in move focus to the message (`tabIndex={-1}`), keeping `role="alert"` for the announcement |
| Disabled states (Medium) | `Button` already had `disabled:opacity-70 disabled:cursor-not-allowed` | Compliant |
| Empty states (Medium) | Cart, orders, notifications, offers and the catalogue each show a message plus an action | Compliant |
| Submit feedback (Medium) | Every submit swaps its label for a spinner and disables itself | Compliant |
| Back button behaviour (High, mobile) | Cart and checkout use real links and URL state, not `location.replace` | Compliant |

Still open: a full error *summary* at the top of the multi-step checkout that links to
each invalid field. Worth doing when the address form grows beyond five inputs; today the
inline errors plus focus movement cover the same ground with less machinery.

## Third pass — product detail page, and a consistency sweep

```bash
python3 src/ui-ux-pro-max/scripts/search.py "premium editorial beauty ecommerce" \
  --design-system --variance 3 --motion 5 --density 5   # "clean" dial
```

Dialled to variance 3 the generator returns the same Feature-Rich Showcase skeleton but a
quieter style, which matches what a product page needs: one decision per screen.

| Finding (rule) | Action |
| --- | --- |
| No image **gallery** — one square photo, and a product can have several (Visual hierarchy) | **Fixed** — `ProductGallery`: fixed 4:5 frame plus a keyboard-operable thumbnail strip with `aria-pressed`, so swapping images never shifts layout |
| Price needed the discount context (Conversion) | **Fixed** — effective price in the display face, list price struck, "You save ₹X" and a % badge derived from the server's numbers |
| Stock was a coloured sentence | **Fixed** — status dot + "N available", and the same fact repeated in the spec card for scanability |
| Trust information existed only on the home page (Trust) | **Fixed** — a three-cell promise strip on the page where the decision is made: live stock, COD/secure checkout from settings, returns |
| Description interrupted the buy column | **Fixed** — moved into its own "About this product" section beside a plain spec card (SKU, brand, category, availability) |
| Dead end after the decision | **Fixed** — "More in {category}" rail, excluding the product being viewed |
| **Hover state identical to rest state** on 13 primary buttons (`bg-baby-400` + `hover:bg-baby-400`) | **Fixed** — hover is `baby-300` |
| Three inputs still used the old focus ring (`ring-bark-900/10`) | **Fixed** — unified to `baby-300`, the same token as the global focus ring |

### Rules now enforced by convention

- **One accent, one focus colour** — `baby-400` fills, `baby-700` text, `baby-300` rings and hovers.
- **Elevation is a border and a shadow, never a gradient** — `border-cream-300` on `cream-50` surfaces.
- **Numbers come from the API** — the page computes only the presentation of a discount (percent, "you save"), never a total.
- **Empty, loading and error states are components, not afterthoughts** — every new section ships with its skeleton.

## Adopted: `next/image` everywhere

The stack guidance is unambiguous — *use `next/image` for all images* — and the codebase
was disabling that lint rule in 23 places. All of them now use the component; zero
`<img>` tags remain in `src/`.

**Configuration** (`next.config.ts`), because the failure mode is a broken image, not an
error:

```ts
const apiOrigin = new URL(API_BASE_URL);          // same variable the browser client uses
images: {
  dangerouslyAllowLocalIP: isLocalApi,            // only when the API host is localhost
  remotePatterns: [
    { protocol: …, hostname: apiOrigin.hostname, port: apiOrigin.port, pathname: "/uploads/**" },
    { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
  ],
}
```

- **The API origin is derived, not hard-coded** — a deployment sets `NEXT_PUBLIC_API_URL`
  once and both the API client and the image allow-list follow.
- **`dangerouslyAllowLocalIP` follows the API host.** Next 16 refuses to fetch images from
  private addresses (SSRF protection); a dev API on `localhost:5000` needs the flag, a
  deployed store on a real hostname must not have it.
- **Cloudinary needs no cloud name** on the frontend: URLs arrive fully qualified.

**Sizing strategy.** Fixed-aspect containers use `fill` plus a `sizes` value that matches
the grid (`(min-width: 1280px) 22vw, (min-width: 768px) 33vw, 50vw` for product cards,
`80px` for cart thumbnails, …); thumbnails with intrinsic dimensions use `width`/`height`.
The product gallery's first frame is `priority`, everything else lazy-loads by default.

**Verified, not assumed:**

```bash
curl "$HOST/_next/image?url=<encoded local upload>&w=96&q=75"
# → 200, Content-Type: image/jpeg, Cache-Control: public, max-age=14400
curl "$HOST/_next/image?url=<encoded https://example.com/x.jpg>&w=96&q=75"
# → 400 "url parameter is not allowed"   (allow-list is doing its job)
```

Both probes were run against `next start` with a stub upload server on the API origin, so
the optimizer path is checked end to end rather than inferred from a green build.

## Re-running it later

The clone lives outside this repository; `/tmp` does not survive a session. To query the
skill again, re-clone and run the commands above. If you want it available to your editor
permanently: `npx ui-ux-pro-max-cli init --ai cursor` (or `claude`, `codex`, …).
