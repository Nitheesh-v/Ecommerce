// src/components/store/store-nav-links.tsx

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/products", label: "Shop", Icon: LayoutGrid, className: "hidden md:inline-flex" },
  { href: "/categories", label: "Categories", Icon: null, className: "hidden lg:inline-flex" },
  { href: "/offers", label: "Offers", Icon: Tag, className: "inline-flex" },
] as const;

/**
 * Primary navigation with a current-location state.
 *
 * Reading `usePathname` makes this a client component, so the header keeps it behind
 * a Suspense boundary and the rest of the bar stays part of the static shell. The
 * active item is marked three ways — background, a baby-blue inset bar and
 * `aria-current="page"` — so it is visible, not just coloured.
 */
export function StoreNavLinks() {
  const pathname = usePathname() ?? "/";

  return (
    <>
      {LINKS.map(({ href, label, Icon, className }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative items-center gap-1.5 rounded-full px-3.5 py-2 text-cream-200 transition-colors hover:bg-cream-50/10 hover:text-cream-50",
              className,
              active &&
                "bg-cream-50/12 text-cream-50 shadow-[inset_0_-2px_0_var(--color-baby-400)]",
            )}
          >
            {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
            {label}
          </Link>
        );
      })}
    </>
  );
}
