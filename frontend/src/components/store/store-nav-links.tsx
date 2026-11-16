// src/components/store/store-nav-links.tsx

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { LayoutGrid, Package, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/products", label: "Shop", Icon: LayoutGrid, className: "hidden md:inline-flex" },
  { href: "/categories", label: "Categories", Icon: null, className: "hidden lg:inline-flex" },
  { href: "/offers", label: "Offers", Icon: Tag, className: "inline-flex" },
  /*
   * "Orders" is the one destination a returning shopper actually wants, and until
   * now it was reachable only through the account menu — two clicks and a known
   * location. The API already serves /account/orders; this exposes it.
   */
  { href: "/account/orders", label: "Orders", Icon: Package, className: "hidden sm:inline-flex" },
] as const;

/**
 * "Are we past hydration?" — no effect, no render-phase read of the environment.
 *
 * `useSyncExternalStore` has exactly these semantics: the server snapshot is used for
 * the hydration render, and React re-reads the client snapshot immediately after
 * mount, before paint. `subscribe` never fires, because this flips once and never
 * back. It also replaces a `useEffect` + `setState` pair that the React Compiler
 * correctly rejects as a cascading render.
 */
const subscribeToNothing = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * Primary navigation with a current-location state.
 *
 * Reading `usePathname` makes this a client component, so the header keeps it behind
 * a Suspense boundary and the rest of the bar stays part of the static shell.
 *
 * The route is applied only **after mount**, deliberately. `PathnameContext` defaults
 * to `null` — this file's own earlier `?? "/"` guard was the tell — so the client's
 * first render computed "no link is active" while the server had already rendered one
 * active link. That mismatch regenerated this whole subtree on every page load.
 * Rendering the *unmarked* nav until the route is known makes both sides agree, and
 * since the only difference is a class and `aria-current`, it lasts one paint.
 *
 * A reader with JavaScript disabled keeps the links and loses only the highlight,
 * which is the right trade for a nav that must never flash or tear.
 */
export function StoreNavLinks() {
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(subscribeToNothing, clientSnapshot, serverSnapshot);

  // `null` means "the route is not known yet": no link is marked, which is exactly
  // what the server rendered.
  const current = hydrated ? (pathname ?? "/") : null;

  return (
    <>
      {LINKS.map(({ href, label, Icon, className }) => {
        const active =
          current !== null && (current === href || current.startsWith(`${href}/`));

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
