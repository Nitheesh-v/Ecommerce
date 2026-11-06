// src/components/ui/price.tsx

/**
 * A price, optionally with the list price struck through beside it.
 *
 * Both amounts arrive as integers in paise and are formatted here — the component
 * never computes a total, a discount or a tax.
 */
import { cn } from "@/lib/utils";
import { formatPrice } from "./format-currency";

type PriceSize = "sm" | "md" | "lg";

const SIZES: Record<PriceSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
};

const LIST_SIZES: Record<PriceSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export function Price({
  amount,
  listAmount,
  currency = "INR",
  size = "md",
  className,
}: {
  /** What the customer pays, minor units. */
  amount: number;
  /** List price, minor units — struck through only when it is higher. */
  listAmount?: number | null;
  currency?: string;
  size?: PriceSize;
  className?: string;
}) {
  const showList = typeof listAmount === "number" && listAmount > amount;

  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-1.5", className)}>
      <span className={cn("font-semibold text-slate-900", SIZES[size])}>
        {formatPrice(amount, currency)}
      </span>
      {showList ? (
        <span className={cn("text-slate-400 line-through", LIST_SIZES[size])}>
          {formatPrice(listAmount, currency)}
        </span>
      ) : null}
    </span>
  );
}
