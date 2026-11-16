import Image from "next/image";
// src/components/store/home/hero-collage.tsx

import Link from "next/link";
import { Star, Sparkles } from "lucide-react";
import { resolveImageUrl } from "@/lib/images";
import { formatCurrency } from "@/lib/utils";
import type { PublicProduct } from "@/types/storefront";

function imageOf(product: PublicProduct) {
  return resolveImageUrl(
    product.images.find((item) => item.isPrimary)?.url ?? product.images[0]?.url,
  );
}

/**
 * One card in the hero collage.
 *
 * The card is a link, the image carries the product name as alt text, and the caption
 * sits on a gradient so it stays readable whatever the photograph is doing.
 */
function CollageCard({
  product,
  className,
  delay,
  sizes,
}: {
  product: PublicProduct;
  className: string;
  delay: string;
  sizes: string;
}) {
  const image = imageOf(product);

  if (!image) {
    return null;
  }

  return (
    <Link
      href={`/products/${product.slug}`}
      className={`animate-float group relative block overflow-hidden rounded-[24px] border border-cream-300 bg-cream-200 ${className}`}
      style={{ animationDelay: delay }}
    >
      <Image
        src={image}
        alt={product.name}
        fill
        sizes={sizes}
        className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
      />
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bark-950/80 via-bark-950/25 to-transparent px-4 pt-10 pb-4">
        <span className="block text-[10px] tracking-[0.2em] text-cream-300 uppercase">
          {product.brand ?? product.category?.name ?? "Ecommerce26"}
        </span>
        <span className="font-display mt-0.5 block truncate text-sm text-cream-50">
          {product.name}
        </span>
        <span className="mt-0.5 block text-xs font-medium text-cream-200">
          {formatCurrency(product.effectivePrice)}
        </span>
      </span>
    </Link>
  );
}

/**
 * The hero's right-hand side: three real products, arranged rather than listed.
 *
 * With no photographed products it degrades to a typographic panel — a landing page
 * with an empty hole above the fold is worse than one that says "publish a product".
 */
export function HeroCollage({ products }: { products: PublicProduct[] }) {
  const withImages = products.filter((product) => imageOf(product) !== null).slice(0, 3);

  if (withImages.length === 0) {
    return (
      <div className="animate-rise relative flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-[28px] border border-cream-300 bg-cream-200 p-8 sm:aspect-[5/4] lg:aspect-[4/5]">
        <span className="text-[10px] font-medium tracking-[0.24em] text-bark-600 uppercase">
          The collection
        </span>
        <p className="font-display text-4xl leading-[1.05] text-bark-900">
          New season,
          <br />
          same honest
          <br />
          prices.
        </p>
        <p className="max-w-[22ch] text-xs leading-relaxed text-bark-600">
          Publish a product in the console and it takes this spot — there is no
          placeholder catalogue.
        </p>
      </div>
    );
  }

  const [main, second, third] = withImages;
  const rating = main.ratingCount > 0 ? main.ratingAverage.toFixed(1) : null;

  return (
    <div className="animate-rise relative">
      {/* A soft wash behind the cards, drifting slowly. */}
      <div
        aria-hidden
        className="animate-hue absolute -inset-6 -z-10 rounded-[48px] bg-[radial-gradient(60%_60%_at_70%_20%,var(--color-baby-200),transparent_70%),radial-gradient(50%_50%_at_20%_80%,var(--color-cream-300),transparent_70%)] blur-2xl"
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <CollageCard
          product={main}
          className="aspect-[3/4]"
          delay="0s"
          sizes="(min-width: 1024px) 260px, 45vw"
        />

        <div className="mt-8 space-y-3 sm:mt-12 sm:space-y-4">
          {second ? (
            <CollageCard
              product={second}
              className="aspect-square"
              delay="1.4s"
              sizes="(min-width: 1024px) 200px, 40vw"
            />
          ) : null}
          {third ? (
            <CollageCard
              product={third}
              className="aspect-[4/5]"
              delay="2.6s"
              sizes="(min-width: 1024px) 200px, 40vw"
            />
          ) : null}
        </div>
      </div>

      {rating ? (
        <div className="animate-float absolute -bottom-4 left-2 flex items-center gap-2 rounded-full border border-cream-300 bg-cream-50/95 px-3.5 py-2 shadow-lg shadow-bark-900/10 backdrop-blur">
          <Star className="h-3.5 w-3.5 fill-baby-600 text-baby-600" aria-hidden />
          <span className="text-xs font-semibold text-bark-950">{rating}</span>
          <span className="text-[11px] text-bark-500">
            from {main.ratingCount.toLocaleString("en-IN")} buyers
          </span>
        </div>
      ) : (
        <div className="animate-float absolute -bottom-4 left-2 flex items-center gap-2 rounded-full border border-cream-300 bg-cream-50/95 px-3.5 py-2 shadow-lg shadow-bark-900/10 backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-baby-700" aria-hidden />
          <span className="text-[11px] font-medium text-bark-700">Freshly published</span>
        </div>
      )}
    </div>
  );
}
