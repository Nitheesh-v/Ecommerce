import Link from "next/link";
import { ImageOff } from "lucide-react";
import { resolveImageUrl } from "@/lib/images";
import { formatCurrency } from "@/lib/utils";
import type { PublicProduct } from "@/types/storefront";

export function ProductCard({ product }: { product: PublicProduct }) {
  const image = resolveImageUrl(
    product.images.find((item) => item.isPrimary)?.url ?? product.images[0]?.url,
  );
  const discounted = Boolean(product.salePrice && product.salePrice < product.price);

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md"
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-slate-100">
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

        {discounted ? (
          <span className="absolute top-2 left-2 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-semibold text-white">
            Sale
          </span>
        ) : null}

        {!product.inStock ? (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs font-semibold text-slate-700">
            Out of stock
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="line-clamp-2 text-sm font-medium text-slate-900">
          {product.name}
        </span>
        {product.brand ? (
          <span className="text-xs text-slate-500">{product.brand}</span>
        ) : null}

        <span className="mt-1 flex items-baseline gap-2">
          <span className="text-sm font-semibold text-slate-900">
            {formatCurrency(product.effectivePrice)}
          </span>
          {discounted ? (
            <span className="text-xs text-slate-400 line-through">
              {formatCurrency(product.price)}
            </span>
          ) : null}
        </span>
      </div>
    </Link>
  );
}
