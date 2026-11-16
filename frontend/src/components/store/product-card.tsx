import Image from "next/image";
// src/components/store/product-card.tsx

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
      <span className={`text-[11px] text-bark-500 ${className}`}>No ratings yet</span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${className}`}>
      <span className="inline-flex items-center gap-0.5 rounded-full bg-bark-900 px-1.5 py-0.5 font-semibold text-cream-50">
        {average.toFixed(1)}
        <Star className="h-2.5 w-2.5 fill-cream-50" aria-hidden />
      </span>
      <span className="text-bark-500">({count.toLocaleString("en-IN")})</span>
    </span>
  );
}

/**
 * Catalogue card.
 *
 * Shows what a shopper decides with: the effective price, the list price it beat,
 * the discount percentage and the rating — all server-computed, never derived from
 * anything the browser could have edited.
 *
 * Styling is editorial rather than marketplace-loud: cream paper, a serif product
 * name, one accent colour, and a shadow that appears only on hover.
 */
export function ProductCard({ product }: { product: PublicProduct }) {
  const image = resolveImageUrl(
    product.images.find((item) => item.isPrimary)?.url ?? product.images[0]?.url,
  );
  const discount = discountPercent(product);

  return (
    <Link
      href={`/products/${product.slug}`}
      className="surface surface-hover group flex h-full flex-col overflow-hidden"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-cream-200">
        {image ? (
          <Image
            src={image}
            alt={product.name}
            fill
            sizes="(min-width: 1280px) 22vw, (min-width: 768px) 33vw, 50vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-6 w-6 text-bark-300" aria-hidden />
          </div>
        )}

        {discount > 0 ? (
          <span className="absolute top-3 left-3 rounded-full bg-baby-400 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-bark-950 uppercase">
            {discount}% off
          </span>
        ) : null}

        {!product.inStock ? (
          <span className="absolute inset-0 flex items-center justify-center bg-cream-50/80 text-[11px] font-semibold tracking-[0.18em] text-bark-800 uppercase backdrop-blur-[2px]">
            Sold out
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-[10px] font-medium tracking-[0.18em] text-bark-500 uppercase">
          {product.brand ?? product.category?.name ?? "Ecommerce26"}
        </span>

        <span className="font-display line-clamp-2 text-[15px] leading-snug text-bark-900">
          {product.name}
        </span>

        <RatingPill average={product.ratingAverage} count={product.ratingCount} />

        <span className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-2">
          <span className="text-[15px] font-semibold text-bark-950">
            {formatCurrency(product.effectivePrice)}
          </span>
          {discount > 0 ? (
            <>
              <span className="text-xs text-bark-500 line-through">
                {formatCurrency(product.price)}
              </span>
              <span className="text-xs font-medium text-baby-700">{discount}% off</span>
            </>
          ) : null}
        </span>
      </div>
    </Link>
  );
}
