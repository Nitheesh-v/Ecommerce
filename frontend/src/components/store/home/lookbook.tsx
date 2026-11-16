// src/components/store/home/lookbook.tsx

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { resolveImageUrl } from "@/lib/images";
import { formatCurrency } from "@/lib/utils";
import type { PublicProduct } from "@/types/storefront";

/**
 * A mosaic of the catalogue's own photography.
 *
 * Deliberately asymmetric: one tall tile, then a run of small ones, so the section
 * reads as an editorial spread instead of another product grid. Tiles are links to
 * the product; nothing here is stock imagery or invented copy.
 */
const SPANS = [
  "col-span-2 row-span-2",
  "col-span-1 row-span-1",
  "col-span-1 row-span-1",
  "col-span-1 row-span-1",
  "col-span-1 row-span-1",
  "col-span-2 row-span-1",
];

export function Lookbook({ products }: { products: PublicProduct[] }) {
  const items = products
    .map((product) => ({
      product,
      image: resolveImageUrl(
        product.images.find((item) => item.isPrimary)?.url ?? product.images[0]?.url,
      ),
    }))
    .filter((item): item is { product: PublicProduct; image: string } => item.image !== null)
    .slice(0, 6);

  if (items.length < 4) {
    return null;
  }

  return (
    <section className="reveal space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-cream-300 pb-3">
        <div>
          <p className="text-[10px] font-medium tracking-[0.24em] text-bark-500 uppercase">
            The lookbook
          </p>
          <h2 className="font-display mt-1.5 text-3xl leading-none text-bark-950 sm:text-[34px]">
            Seen in the wild
          </h2>
        </div>
        <Link
          href="/products"
          className="group inline-flex items-center gap-1 text-xs font-medium tracking-wide text-bark-700 uppercase hover:text-bark-950"
        >
          Shop the catalogue
          <ArrowUpRight
            className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>

      <div className="grid auto-rows-[150px] grid-cols-2 gap-3 sm:auto-rows-[180px] sm:grid-cols-4 sm:gap-4">
        {items.map(({ product, image }, index) => (
          <Link
            key={product.id}
            href={`/products/${product.slug}`}
            className={`group relative block overflow-hidden rounded-[20px] border border-cream-300 bg-cream-200 ${SPANS[index] ?? "col-span-1 row-span-1"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
            />

            <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-bark-950/85 via-bark-950/20 to-transparent px-3 pt-10 pb-3">
              <span className="min-w-0">
                <span className="font-display block truncate text-sm text-cream-50">
                  {product.name}
                </span>
                <span className="block text-[11px] text-cream-300">
                  {formatCurrency(product.effectivePrice)}
                </span>
              </span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cream-50/15 text-cream-50 transition-colors group-hover:bg-baby-400 group-hover:text-bark-950">
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
