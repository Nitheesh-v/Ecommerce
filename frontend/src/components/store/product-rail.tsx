// src/components/store/product-rail.tsx

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import type { PublicProduct } from "@/types/storefront";
import { ProductCard } from "./product-card";

/**
 * A titled row of products, as an editorial home page uses everywhere.
 *
 * Server-rendered: the rails are cached catalogue reads, so the landing page is
 * static HTML plus a link — no client fetch, no layout shift.
 */
export function ProductRail({
  title,
  description,
  href,
  products,
  action,
}: {
  title: string;
  description?: string;
  href?: string;
  products: PublicProduct[];
  action?: ReactNode;
}) {
  if (products.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-cream-300 pb-3">
        <div>
          <h2 className="font-display text-2xl leading-none text-bark-900 sm:text-[28px]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1.5 text-xs text-bark-500">{description}</p>
          ) : null}
        </div>
        {href ? (
          <Link
            href={href}
            className="group inline-flex items-center gap-1 text-xs font-medium tracking-wide text-bark-700 uppercase transition-colors hover:text-bark-950"
          >
            View all
            <ArrowUpRight
              className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        ) : null}
      </div>

      <div className="relative">
        {action}

        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible lg:grid-cols-5">
          {products.map((product) => (
            <div
              key={product.id}
              className="w-[46%] shrink-0 snap-start sm:w-auto sm:shrink"
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
