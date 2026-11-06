// src/components/ui/format-currency.ts

/**
 * Money formatting for the storefront.
 *
 * `lib/utils.formatCurrency` is the single place the app divides paise by 100;
 * these helpers add the shopping-specific phrasings (a signed discount, a
 * free-shipping threshold, a gap to the next threshold) without ever doing
 * arithmetic on a formatted string.
 */
import { formatCurrency } from "@/lib/utils";

/** `129900` → `₹1,299`. The only formatting an amount should ever get. */
export function formatPrice(minorUnits: number, currency = "INR"): string {
  return formatCurrency(minorUnits, currency);
}

/** `-₹1,299` for a discount, `₹0` when there is nothing to show. */
export function formatDiscount(minorUnits: number, currency = "INR"): string {
  return minorUnits > 0 ? `−${formatPrice(minorUnits, currency)}` : formatPrice(0, currency);
}

/** "Free shipping on orders above ₹999" — the threshold comes from the server. */
export function formatFreeShippingThreshold(
  thresholdMinor: number,
  currency = "INR",
): string {
  if (thresholdMinor <= 0) {
    return "Free shipping on every order";
  }

  return `Free shipping on orders above ${formatPrice(thresholdMinor, currency)}`;
}

/** "Add ₹249 more for free shipping". */
export function formatFreeShippingGap(gapMinor: number, currency = "INR"): string {
  return `Add ${formatPrice(gapMinor, currency)} more for free shipping`;
}
