import Image from "next/image";
// src/components/store/home/hero-collage.tsx

import Link from "next/link";
import { Star, Sparkles } from "lucide-react";
import { resolveImageUrl } from "@/lib/images";
import { formatCurrency } from "@/lib/utils";
import type { PublicProduct } from "@/types/storefront";
import { TiltSurface } from "./tilt-surface";

function imageOf(product: PublicProduct) {
  return resolveImageUrl(
    product.images.find((item) => item.isPrimary)?.url ??
      product.images[0]?.url,
  );
}

/**
 * One card in the hero collage.
 *
 * The card is a link, the image carries the product name as alt text, and the caption
 * sits on a gradient so it stays readable whatever the photograph is doing.
 *
 * It is also a layer in the hero's 3D stage: `depth` pushes it toward the viewer,
 * `bob` gives it its own clock so three cards never move together, and `tilt` makes it
 * lean toward the pointer. All three are CSS custom properties, and the class names
 * are what `globals.css` reads — so the card is placed correctly on the server and
 * only *moves* in the browser.
 */
function CollageCard({
  product,
  className,
  delay,
  sizes,
  depth,
  bob,
  tilt = "4deg",
}: {
  product: PublicProduct;
  className: string;
  delay: string;
  sizes: string;
  /** How far forward the card sits in the stage, in CSS px. */
  depth: number;
  /** Vertical drift for this card's bob, so no two cards share a cycle. */
  bob: string;
  /** Base Y rotation, which is what makes a flat photograph read as a panel. */
  tilt?: string;
}) {
  const image = imageOf(product);

  if (!image) {
    return null;
  }

  return (
    <TiltSurface className={className}>
      <Link
        href={`/products/${product.slug}`}
        className="animate-depth group relative block h-full overflow-hidden rounded-[24px] border border-cream-300 bg-cream-200 shadow-[0_18px_40px_-24px_rgb(59_36_24/0.55)]"
        style={
          {
            animationDelay: delay,
            "--depth": `${depth}px`,
            "--bob-lift": bob,
            "--bob-ry": tilt,
          } as React.CSSProperties
        }
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
    </TiltSurface>
  );
}

/**
 * The hero's right-hand side: three real products, arranged rather than listed.
 *
 * With no photographed products it degrades to a typographic panel — a landing page
 * with an empty hole above the fold is worse than one that says "publish a product".
 */
export function HeroCollage({ products }: { products: PublicProduct[] }) {
  const withImages = products
    .filter((product) => imageOf(product) !== null)
    .slice(0, 3);

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
      {/* A soft wash behind the cards, drifting slowly. Sits further back in the
          stage than the cards, so the depth order is wash < cards < rating chip. */}
      <div
        aria-hidden
        className="animate-hue absolute -inset-6 -z-10 rounded-[48px] bg-[radial-gradient(60%_60%_at_70%_20%,var(--color-baby-200),transparent_70%),radial-gradient(50%_50%_at_20%_80%,var(--color-cream-300),transparent_70%)] blur-2xl"
      />

      {/*
        The stage. One `perspective` for the whole collage, so the three cards share a
        vanishing point and read as one arrangement in space — three separate
        perspectives would read as three flat pictures. `preserve-3d` is what lets the
        children's `translateZ` mean anything.
      */}
      <div className="scene">
        <div className="grid grid-cols-2 gap-3 [transform-style:preserve-3d] sm:gap-4">
          <CollageCard
            product={main}
            className="aspect-[3/4]"
            delay="0s"
            sizes="(min-width: 1024px) 260px, 45vw"
            depth={54}
            bob="-14px"
            tilt="5deg"
          />

          <div className="mt-8 space-y-3 [transform-style:preserve-3d] sm:mt-12 sm:space-y-4">
            {second ? (
              <CollageCard
                product={second}
                className="aspect-square"
                delay="-4.5s"
                sizes="(min-width: 1024px) 200px, 40vw"
                depth={18}
                bob="-9px"
                tilt="-6deg"
              />
            ) : null}
            {third ? (
              <CollageCard
                product={third}
                className="aspect-[4/5]"
                delay="-8.5s"
                sizes="(min-width: 1024px) 200px, 40vw"
                depth={92}
                bob="-18px"
                tilt="7deg"
              />
            ) : null}
          </div>
        </div>
      </div>

      {/*
        The floating chip is the nearest layer in the stage: it sits in front of the
        cards and drifts on its own clock, which is what makes the parallax readable.
      */}
      <div
        className="animate-float absolute -bottom-4 left-2 [transform:translateZ(120px)]"
        style={{ animationDelay: "-2.5s" }}
      >
        <div className="flex items-center gap-2 rounded-full border border-cream-300 bg-cream-50/95 px-3.5 py-2 shadow-lg shadow-bark-900/10 backdrop-blur">
          {rating ? (
            <>
              <Star
                className="h-3.5 w-3.5 fill-baby-600 text-baby-600"
                aria-hidden
              />
              <span className="text-xs font-semibold text-bark-950">
                {rating}
              </span>
              <span className="text-[11px] text-bark-500">
                from {main.ratingCount.toLocaleString("en-IN")} buyers
              </span>
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 text-baby-700" aria-hidden />
              <span className="text-[11px] font-medium text-bark-700">
                Freshly published
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
