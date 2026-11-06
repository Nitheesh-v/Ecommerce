"use client";

// src/components/cart/cart-item.tsx

/**
 * One line in the cart.
 *
 * An unavailable product stays visible — greyed out, priced at zero, flagged with
 * the reason the server gave ("Out of stock", "Only 2 left") — because silently
 * deleting it would look like the shop lost the customer's choice.
 */
import Link from "next/link";
import { ImageOff, Trash2 } from "lucide-react";
import { resolveImageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/components/ui/format-currency";
import { Price } from "@/components/ui/price";
import type { CartItem } from "@/types/cart";
import { QuantitySelector } from "./quantity-selector";

export function CartItemRow({
  item,
  currency,
  updating = false,
  onQuantityChange,
  onRemove,
}: {
  item: CartItem;
  currency: string;
  updating?: boolean;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}) {
  const image = resolveImageUrl(item.imageUrl);
  const name = item.slug ? (
    <Link
      href={`/products/${item.slug}`}
      className="text-sm font-medium text-slate-900 hover:text-slate-700 hover:underline"
    >
      {item.name}
    </Link>
  ) : (
    <span className="text-sm font-medium text-slate-900">{item.name}</span>
  );

  return (
    <li
      className={cn(
        "flex gap-3 py-4 first:pt-0 last:pb-0",
        !item.available && "opacity-60",
      )}
    >
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <ImageOff className="h-5 w-5 text-slate-300" aria-hidden />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {name}
            {item.sku ? (
              <p className="mt-0.5 font-mono text-[11px] text-slate-400">SKU {item.sku}</p>
            ) : null}
            {!item.available ? (
              <span className="mt-1.5 inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                {item.unavailableReason ?? "Out of stock"}
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${item.name} from the cart`}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
          <div className="space-y-1">
            <Price
              amount={item.unitPrice}
              listAmount={item.listPrice}
              currency={currency}
              size="sm"
            />
            <p className="text-[11px] text-slate-500">
              {formatPrice(item.unitPrice, currency)} each
            </p>
          </div>

          <div className="flex items-center gap-3">
            <QuantitySelector
              value={item.quantity}
              onChange={onQuantityChange}
              disabled={!item.available}
              updating={updating}
              max={Math.max(1, Math.min(99, item.stock || 99))}
            />
            <span className="min-w-16 text-right text-sm font-semibold text-slate-900">
              {item.available ? formatPrice(item.lineTotal, currency) : "—"}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
