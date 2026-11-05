import Link from "next/link";
import { ImageOff, Star } from "lucide-react";
import { resolveImageUrl } from "@/lib/images";
import { formatCurrency } from "@/lib/utils";
import type { PublicProduct } from "@/types/storefront";

/** `(list − sale) / list`, rounded to whole percent; `0` when not discounted. */
export function discountPercent(product: PublicProduct): number {
  if (!product.salePrice || product.salePrice >= product.price) {
    return 0;
  }

  return Math.round(((product.price - product.salePrice) / product.price) * 100);
}

export function RatingPill({
  average,
  count,
  className = "",
}: {
  average: number;
  count: number;
  className?: string;
}) {
  if (count === 0) {
    return (
      <span className={`text-[11px] text-slate-400 ${className}`}>No ratings yet</span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${className}`}>
      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-600 px-1 py-0.5 font-semibold text-white">
        {average.toFixed(1)}
        <Star className="h-2.5 w-2.5 fill-white" aria-hidden />
      </span>
      <span className="text-slate-500">({count.toLocaleString("en-IN")})</span>
    </span>
  );
}

/**
 * Catalogue card.
 *
 * Shows what a shopper decides with: the effective price, the list price it beat,
 * the discount percentage and the rating — all server-computed, never derived from
 * anything the browser could have edited.
 */
export function ProductCard({ product }: { product: PublicProduct }) {
  const image = resolveImageUrl(
    product.images.find((item) => item.isPrimary)?.url ?? product.images[0]?.url,
  );
  const discount = discountPercent(product);

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md"
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-slate-50">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <ImageOff className="h-6 w-6 text-slate-300" aria-hidden />
        )}

        {discount > 0 ? (
          <span className="absolute top-2 left-2 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {discount}% OFF
          </span>
        ) : null}

        {!product.inStock ? (
          <span className="absolute inset-0 flex items-center justify-center bg-white/75 text-xs font-semibold text-slate-700">
            Out of stock
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        {product.brand ? (
          <span className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
            {product.brand}
          </span>
        ) : null}

        <span className="line-clamp-2 text-sm leading-snug font-medium text-slate-900">
          {product.name}
        </span>

        <RatingPill average={product.ratingAverage} count={product.ratingCount} />

        <span className="mt-auto flex flex-wrap items-baseline gap-1.5 pt-1">
          <span className="text-base font-semibold text-slate-900">
            {formatCurrency(product.effectivePrice)}
          </span>
          {discount > 0 ? (
            <>
              <span className="text-xs text-slate-400 line-through">
                {formatCurrency(product.price)}
              </span>
              <span className="text-xs font-medium text-emerald-600">{discount}% off</span>
            </>
          ) : null}
        </span>
      </div>
    </Link>
  );
}
