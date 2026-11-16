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

## Fourth pass — browse → buy, and the waiting states

The three passes above audited screens that already existed. This pass looked for
*journeys that stop short*, which a screen-by-screen review does not catch.

| Finding (rule) | State before | Action |
| --- | --- | --- |
| **Shopping from a grid** (Conversion, High) | A product card had exactly one action — open the detail page. Buying three things meant three round trips, and the catalogue had no add-to-cart at all. | **Fixed** — `QuickAdd` on the card media: hover/focus-revealed for pointers, always visible on touch, with inline spinner → tick plus a toast. Signed-out clicks go to `/login?next=…`, same contract as the product page. |
| **Button inside an anchor** (HTML validity, keyboard) | The card was one `<Link>`; adding a nested control would have been invalid HTML and swallowed clicks | **Fixed** — the card is a wrapper `<article>` with an overlay link and the quick-add as a *sibling*, above it in z-order. Text sits in a `pointer-events-none` layer so the link stays clickable. |
| **Deciding on mobile** (Conversion, High) | On a phone the gallery filled the first screen, pushing price and the only "Add to cart" below the fold | **Fixed** — `StickyBuyBar`, `lg:hidden`, revealed only once the real buy block (`data-buy-anchor`) scrolls away, so two identical CTAs are never on screen. Honours `env(safe-area-inset-bottom)`, `motion-reduce:transition-none`, and is `tabIndex={-1}`/`aria-hidden` while off-screen. |
| **Sharing a product** (Social proof, Low) | Shoppers copied the address bar | **Fixed** — `ShareProduct` uses `navigator.share` where available, clipboard elsewhere, with a "Copied" confirmation. No third-party SDK. |
| **Progress through checkout** (Form completion, Medium) | Step numbers lived inside each collapsible section, so "how much is left" was only answerable after scrolling | **Fixed** — a three-beat `CheckoutProgress` at the top of the page, with a completed tick per finished step and `aria-current="step"`. |
| **Payable total on mobile** (Conversion, High) | At checkout the total and the only forward action sat at the bottom of step three | **Fixed** — a sticky payable bar under `sm` whose button continues to the next step or places the order, disabled while stock blocks the order. |
| **Free-shipping incentive** (Conversion, Medium) | "Spend ₹X more for free shipping" was 11px grey text | **Fixed** — a `role="progressbar"` meter beside it, width computed from the server's own `freeShippingGap`/`freeShippingThreshold`. |
| **Meaningful loading states** (Feedback, High) | No `loading.tsx` anywhere, so every server-rendered navigation was a blank screen until the API answered | **Fixed** — `app/(store)/**/loading.tsx` built from `components/store/skeletons.tsx`: catalogue, product, category, offers and account shapes with the exact aspect ratios they replace, inside `role="status" aria-busy`. |
| **Error and 404 pages** (Trust, High) | A thrown error rendered Next's default black-on-white screen; an unknown product slug rendered a bare 404 | **Fixed** — `(store)/error.tsx` (retry + home, shows the error digest for support, never the internal message) and `app/not-found.tsx` with a working no-JS search form. |

### Preview fixtures

Reviewing a storefront that needs MongoDB is friction, so `frontend/scripts/demo-api.mjs`
answers the public endpoints with fixtures shaped like the real contracts, and six
generated product photos live in `public/demo/`. `npm run dev` plus that script is a
complete visual review environment; see `frontend/scripts/README.md`. No application
code imports either, and the real API's e2e suite remains the behaviour test.

## Fifth pass — sign in, sign up, and the console's failure modes

| Finding (rule) | State before | Action |
| --- | --- | --- |
| **Sign-in has no context or exit** (Trust, Medium) | A lone card in a `max-w-md` column: no reason an account is worth having, and no way back to the shop short of the logo | **Fixed** — `AuthShell`: the same card plus a "why an account" rail from `lg` (orders, offers, saved addresses), a "keep browsing" link above the form, and the security promise moved out of the card so the form stays focused. |
| **Password rules stated, not shown** (Form feedback, Medium) | Sign-up described its rules in a hint ("8+ characters, a letter and a number") and only complained after a submit | **Fixed** — `PasswordStrength`: four ticking rules mirroring the zod schema exactly, a tone-graded meter and an `aria-live` label. The schema remains the authority; this is feedback. |
| **No password reveal on sign-up** (Usability, Medium) | Sign-in could reveal the password; sign-up could not, and typing a long password blind on a phone is where mismatches come from | **Fixed** — one reveal toggle drives both password fields. |
| **Loading skeleton did not match the page** (Perceived performance, Low) | The auth pages' `Suspense` fallback was one flat block; the card (and, from `lg`, the rail) then jumped into place | **Fixed** — `AuthPageSkeleton` mirrors the real two-column shell. |
| **Order history unreachable from the nav** (Navigation, High) | `/account/orders` — the one page a returning shopper wants — existed but was reachable only through the account dropdown | **Fixed** — "Orders" added to the primary nav (`sm` and up), with the same active-state treatment as the other links. |
| **Console had no error boundary** (Recovery, High) | A thrown error left the console blank; there was no way back except editing the URL | **Fixed** — `admin/(console)/error.tsx`, rendered *inside* the shell so the sidebar and header stay, showing the message, the digest the server logged, and a retry. |
| **Stale console link** (Recovery, Low) | The default 404 | **Fixed** — `admin/(console)/not-found.tsx`, kept small on purpose: no client screen calls `notFound()` today, so this is a safety net rather than a designed screen. |

### Considered and rejected

`loading.tsx` for the console routes. Every console screen is a client component that
opts out of instant navigation (`export const instant = false`) and renders its own
skeleton while its data loads, and the admin shell already keeps the chrome mounted.
Route-level `loading.tsx` files compiled but were never emitted into the build — dead
files. They were written, verified, and deleted rather than shipped unexercised.
The two that do carry their weight (error and not-found) remain.
