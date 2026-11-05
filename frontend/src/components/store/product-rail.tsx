import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import type { PublicProduct } from "@/types/storefront";
import { ProductCard } from "./product-card";

/**
 * A titled row of products, as a marketplace home page uses everywhere.
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
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          ) : null}
        </div>
        {href ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 hover:underline"
          >
            View all
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
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
