# Phase 17 — Cart & checkout

The catalogue, the offers engine, the order book, inventory and the payment gateway all
existed by the end of Phase 16 — but there was no way to *shop*. This phase adds the
middle of the funnel: a server-side cart with live prices, and a three-step checkout that
turns the cart into an order and, when money moves online, into a verified payment.

The rule that shaped every file: **the server owns the money and the client owns only the
intent.** The browser sends a product id, a quantity, an address id and a payment *method*
— never a price, a discount or a total. Every amount the customer sees is the amount the
order will charge, because both are produced by the same function.

---

## 1. Addresses — a new collection, not a field on the user

The customer document has no address book, and rewriting it mid-project would have
touched auth, admin and every fixture. So Phase 17 adds a small, owner-scoped
`addresses` collection instead:

| Method | Route | Behaviour |
| --- | --- | --- |
| `GET` | `/api/addresses` | the caller's addresses, default first |
| `POST` | `/api/addresses` | save one; the first becomes the default automatically |
| `PATCH` | `/api/addresses/:id` | edit, or promote to default (clearing the old one) |
| `DELETE` | `/api/addresses/:id` | remove |

- Every query carries the owner's id, so **another customer's address is a `404`** —
  identical to one that does not exist. An address book is not a place to probe.
- Field rules (`phone`, `postalCode`, lengths) mirror `ShippingAddressDto` exactly, so an
  address that validates here can always be turned into an order without a second round
  of surprises at checkout.
- `ActiveAccountGuard` refuses suspended accounts; the module imports `UsersModule` for it.

## 2. The cart — one document per customer

`GET /api/cart` returns the cart **with its price breakdown**, and every mutation returns
the same shape:

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/api/cart` | no cart document yet → an empty cart with zeroed totals, not a 404 |
| `POST` | `/api/cart/items` | adding an existing product **increments** it; stock is checked |
| `PATCH` | `/api/cart/items/:productId` | `quantity: 0` removes the line |
| `DELETE` | `/api/cart/items/:productId` | remove one line |
| `DELETE` | `/api/cart` | empty the cart (the coupon goes with it) |
| `POST` | `/api/cart/coupon` | validate the code against the live cart, then store it |
| `DELETE` | `/api/cart/coupon` | forget the code |

Design decisions that matter:

- **Prices are not stored.** The cart keeps `productId`, `quantity`, a `priceAtAdd`
  snapshot (display only) and `addedAt`. Reading the cart resolves each product's *live*
  price, so a sale that starts or ends is reflected immediately — and the order that
  follows charges the same number.
- **A coupon is stored as a code, never as an amount**, and re-priced on every read. If it
  expired, ran out of uses, or the cart dropped below its minimum, it is *removed* and the
  reason is returned once as `couponIssue`. A stale discount cannot survive to checkout.
- **Unavailable items stay in the cart**, flagged `available: false` with the server's
  reason ("Out of stock", "Only 2 left in stock", "no longer in the catalogue"). They are
  shown, greyed out and unpriced — deleting them silently would look like the shop lost
  the customer's choice. The cart counts them as `unavailableCount`, excludes them from
  the totals, and refuses checkout while they are there.
- **Quantities are capped** at 99 and at live stock; both are checked on add and on update.

## 3. One price list, shared by the cart, the preview and the order

Totals come from `computeTotals()` — the same function Phase 9's orders use:

```
subtotal      Σ list price × qty          (the "before discount" figure)
discountTotal Σ (list − charged) × qty    (sale-price savings)
coupon        percentage / fixed / free-shipping, from CouponPricingService
taxable       goodsValue − coupon
tax           Math.round(taxable × settings.taxRatePercent / 100)
shipping      free for a free-shipping coupon, or at/above the threshold, else the flat fee
grandTotal    taxable + tax + shipping
```

All values are integer paise. The tax multiplication is the only place rounding happens,
and it happens once. `SettingsService.pricing()` remains the single pricing authority, so
an admin's change to the tax rate, shipping fee or free-shipping threshold applies to the
very next cart read.

## 4. Checkout — preview, place, verify

| Method | Route | What it does |
| --- | --- | --- |
| `POST` | `/api/checkout/preview` | prices the cart for an address + payment method; **writes nothing** |
| `POST` | `/api/checkout/place` | revalidates everything, creates the order, reserves stock, spends the coupon, empties the cart, starts the gateway attempt |
| `POST` | `/api/checkout/verify-payment` | verifies the gateway signature, re-reads the payment, confirms the order |

**Preview** revalidates address ownership, stock, the applied coupon and the payment
method, and returns items, the full breakdown, payment availability and an estimated
delivery date (five working days, weekend-aware). It is a genuine dry run: no order row,
no reservation, no coupon redemption — so the page can call it on every change.

**Place** builds a `CreateOrderDto` from the cart snapshot and delegates to
`OrdersService.createForCustomer()`. That module already owns the transactional part
(stock reservation with compensation, coupon reserve → attach, idempotency) and this
phase does not re-implement any of it. What checkout adds is policy:

- an empty cart is a `400`; a stale coupon, missing stock or an unavailable product is a
  `409` that names the items;
- **cash on delivery is an operator decision**: switched off, or capped at an amount, both
  enforced *here* — the browser hiding a card is a courtesy, not the control;
- online payment requires a configured gateway, checked before the order exists;
- the cart is cleared **only when a genuinely new order was created** — an idempotent
  replay must not wipe the next basket the customer has started;
- the gateway attempt is created **after** the order, from the stored total. If the
  gateway refuses, the order still stands (payable from "My orders") and the error says so
  instead of pretending the checkout failed.

**Order status.** A new order is `pending`. Checkout confirms a COD order immediately —
there is no money to wait for. An online order is confirmed only after its payment is
`paid`; payments confirmed by webhook are picked up the same way (`confirmPlacement()` is
idempotent). A failure to confirm never turns a captured payment into an error page.

**Verify** delegates to `PaymentsService.verifyPayment()` (signature → gateway re-read →
capture applied to the order) and translates a failed signature into **`422`**, because
the request was well-formed and the server said no.

## 5. Backend surface added

- `carts` collection (`userId` unique), `addresses` collection, and the `codMaxAmount`
  setting (minor units, `0` = no cap) on the settings document, its admin view, its public
  view and its update DTO.
- `GET/POST/PATCH/DELETE /api/addresses`, the seven `/api/cart` routes above and the three
  `/api/checkout` routes.
- `CartsModule`, `AddressesModule`, `CheckoutModule` registered in `app.module.ts`;
  `Cart` and `Address` model tokens stubbed in `test/support/create-test-app.ts`.

## 6. Frontend

### Cart (`/cart`)

- **Signed out** → "Sign in to view your cart", with sign-in / register links carrying
  `?next=/cart`. Deliberately *not* a forced redirect: the page is readable, and bouncing a
  visitor loses their place.
- **Empty** → a friendly empty state pointing at `/products`.
- **Filled** → two-thirds item list, one-third sticky summary.
  - Each row: 80×80 image, name linked to `/products/[slug]`, SKU, unit price with the list
    price struck through, quantity stepper, line total, remove (trash).
  - Unavailable rows are dimmed with a red badge and an unpriced line total.
  - Quantity is **optimistic**: the number changes instantly, the write is debounced
    500 ms, and a rejection puts the server's own cart back and shows a toast
    ("Updating…" spins meanwhile). Totals are never patched locally — they arrive with
    the response.
  - Coupon input applies/removes the stored code, with a green applied badge, a red inline
    error, and a toast on removal.
  - Summary: subtotal (with item count), discount, coupon, tax (GST), shipping
    (`FREE` / amount / "Add ₹X more for free shipping"), divider, bold total,
    "Proceed to checkout" (disabled with an explanation when an item is unavailable),
    "Prices inclusive of all taxes" and the secure-checkout / free-returns / genuine
    badges. "Clear cart" asks first.
- Coupons are never priced in the browser: the API returns the discount.

### Checkout (`/checkout`)

Three collapsible sections over one server-priced cart:

1. **Address** — saved cards (default first) plus an inline "Add new address" form that
   posts to `/api/addresses` and selects what comes back.
2. **Payment** — online vs cash on delivery, each with its availability. COD shows
   "Currently unavailable" when switched off and "Available on orders up to ₹X" when the
   total exceeds the cap; the choice falls back to the usable method automatically.
3. **Review** — the item list, the exact breakdown from the preview, an optional delivery
   note (500 chars, counted), and one button: green for COD, blue for online. While
   processing, every input is disabled and the button spins.

Signed-out visitors are sent to `/login?next=%2Fcheckout`; an empty cart returns to
`/cart`. Stock disappearing after the cart is a `409` rendered as "Some items are no longer
available" with a link back to the cart; a coupon that expired between screens shows the
API's message. The Razorpay widget is opened from the server-issued gateway order, and its
success callback is only *reported* — the confirmation comes from
`/api/checkout/verify-payment`. On success the browser goes to
`/checkout/success?orderId=…`; on failure it stays, keeps the inputs disabled and says the
order is saved and payable from "My orders".

`/checkout/success` re-reads the order from the API (so a reload works and someone else's
id is refused), plays a CSS-only checkmark animation (respecting
`prefers-reduced-motion`), shows the copyable order number, "Track your order",
"Continue shopping", and a compact summary.

### Shared pieces

- `components/ui/format-currency.ts` + `price.tsx` — the only place paise become text.
- `components/cart/{cart-item,quantity-selector,coupon-input,order-summary}.tsx` and
  `components/checkout/{address-selector,payment-selector,order-review}.tsx`.
- `services/store/cart.service.ts` (`getCart`, `addToCart`, `updateCartItem`,
  `removeCartItem`, `clearCart`, `applyCoupon`, `removeCoupon`) and the checkout calls
  (`previewCheckout`, `placeOrder`, `verifyPayment`), plus `services/store/address.service.ts`.
- `store/cart.store.ts` — Zustand: `cart`, `status`, `itemCount`, `updatingItemId`,
  `couponPending`, `couponError`. Every mutation stores the cart the API returned.
  It subscribes to the session module once, so **signing in loads the cart and signing
  out (or an expired refresh) empties it** — a shared browser cannot leak a basket.
- `Toaster` is now mounted in the storefront shell as well as the admin one, so the cart's
  and the checkout's toasts are actually visible.
- The header gained a cart icon with a blue count badge (hidden at zero, icon always
  visible), and product pages gained a real "Add to cart" button that sends signed-out
  shoppers to sign-in with the product page as `next`.

## 7. Verification

| Suite | Result |
| --- | --- |
| Backend `npm run verify` | typecheck, lint, **247 unit**, **336 e2e**, production build — green |
| `src/modules/cart/cart.service.spec.ts` | 25 — reads, add/increment/update/remove/clear, coupon apply/remove/expiry, paise rounding, sale pricing, stock validation, unavailable flags, checkout snapshot |
| `src/modules/checkout/checkout.service.spec.ts` | 18 — preview without writes, address/stock/coupon/COD refusals, COD place, online place + gateway hand-off, idempotent replay, stock race, gateway outage, verification mapping (422) |
| `test/cart-checkout.e2e-spec.ts` | 27 — auth, cart lifecycle, stock refusals, shipping/tax totals, coupon apply/expiry/free-shipping, preview, COD place + stock reservation + cart clearing, coupon redemption, idempotency, stock depletion, COD limit, online place, verified payment, forged signature (`422`) |
| Frontend | typecheck, lint, build — green; **48 routes** (was 45): `/cart`, `/checkout` static shells, `/checkout/success` dynamic |

## 8. Deliberately not built

- **Guest cart / guest checkout.** The cart is keyed by `userId`; merging an anonymous
  basket into an account is a real feature with real edge cases, not a shortcut to fake.
- **Wishlist, save-for-later, buy-now.** No endpoints, so no buttons.
- **Multi-currency.** Settings intentionally lock the currency once money exists.
- **Saved payment methods / card vaulting.** Card data never touches this store — the
  gateway hosts the form.
- **Coupon auto-suggestions at checkout.** The offers page lists them; guessing which one
  the customer wants would be a second pricing opinion.
