"use client";

// src/components/store/home/tilt-surface.tsx

/**
 * A card that leans toward the pointer.
 *
 * Two elements, on purpose: the outer one owns the perspective (so siblings do not
 * fight over one vanishing point) and the inner one carries `.tilt`. The glare is a
 * sibling of the content, `pointer-events-none` and `aria-hidden`, so it never
 * swallows a click on the product link underneath.
 *
 * Server-rendered flat: every angle comes from custom properties the hook writes
 * after mount. With no JavaScript, no pointer, or reduced motion, this is an
 * ordinary still card — a correct fallback, not a degraded one.
 */
import { useRef } from "react";
import { usePointerTilt } from "@/hooks/use-pointer-tilt";
import { cn } from "@/lib/utils";

export function TiltSurface({
  children,
  className,
  innerClassName,
  radiusClassName = "rounded-[24px]",
  glare = true,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  /**
   * The card's own corner radius, repeated for the glare. It has to be passed rather
   * than inherited: the glare is a sibling of the card, so `rounded-[inherit]` would
   * resolve against the frame, which has no radius at all.
   */
  radiusClassName?: string;
  /** Off for surfaces where a highlight would fight the artwork. */
  glare?: boolean;
  /**
   * Custom properties for the caller's own geometry (`--fan-ry`, `--fan-z`), which
   * `.tilt` composes *under* the pointer angles. Never a `transform` utility: `.tilt`
   * already sets `transform`, and two declarations do not add up — the later one
   * silently wins.
   */
  style?: React.CSSProperties;
}) {
  const frame = useRef<HTMLDivElement>(null);

  usePointerTilt(frame);

  return (
    <div ref={frame} style={style} className={cn("[perspective:900px]", className)}>
      <div className={cn("tilt relative h-full", innerClassName)}>
        {children}
        {glare ? (
          <span
            aria-hidden
            className={cn(
              "glare pointer-events-none absolute inset-0 z-20",
              radiusClassName,
            )}
          />
        ) : null}
      </div>
    </div>
  );
}
