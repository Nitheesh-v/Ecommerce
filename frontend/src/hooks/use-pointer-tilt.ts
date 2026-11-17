"use client";

// src/hooks/use-pointer-tilt.ts

/**
 * Pointer-driven 3D tilt, expressed as CSS custom properties.
 *
 * The hook owns no styles. It writes `--tilt-x` / `--tilt-y` (each -1..1) and
 * `--tilt-intensity` (0..1) onto the element, and `.tilt` / `.glare` in `globals.css`
 * do the rest. That split matters: the geometry is one declaration shared by every
 * card, and the server render already places the cards correctly -- this only
 * animates them once a real pointer exists.
 *
 * Three deliberate restraints:
 *
 * - **Reduced motion is never violated.** The media query is read before any
 *   listener is attached, and re-read if the reader changes the setting.
 * - **Touch is ignored.** A coarse pointer gets no tilt; a card that lurches as you
 *   scroll past it is worse than a still one.
 * - **Nothing runs while idle.** Updates coalesce into one rAF per pointer move, and
 *   the variables reset when the pointer leaves.
 */
import { useEffect, type RefObject } from "react";

/** How far the card is pushed toward the viewer while hovered, in CSS px. */
const HOVER_LIFT = 14;

export function usePointerTilt<T extends HTMLElement>(
  ref: RefObject<T | null>,
): void {
  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

    let frame = 0;
    let pending: { x: number; y: number } | null = null;

    const flush = () => {
      frame = 0;

      if (!pending) {
        return;
      }

      const { x, y } = pending;

      pending = null;

      element.style.setProperty("--tilt-x", x.toFixed(3));
      element.style.setProperty("--tilt-y", y.toFixed(3));
      element.style.setProperty("--tilt-intensity", "1");
    };

    const reset = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }

      pending = null;
      element.style.setProperty("--tilt-x", "0");
      element.style.setProperty("--tilt-y", "0");
      element.style.setProperty("--tilt-intensity", "0");
      element.style.setProperty("--tilt-lift", "0px");
      element.removeAttribute("data-tilting");
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }

      const box = element.getBoundingClientRect();

      // -1..1 from the centre, so the middle of the card is flat and the edges turn.
      pending = {
        x: Math.max(
          -1,
          Math.min(1, ((event.clientX - box.left) / box.width) * 2 - 1),
        ),
        y: Math.max(
          -1,
          Math.min(1, ((event.clientY - box.top) / box.height) * 2 - 1),
        ),
      };

      element.setAttribute("data-tilting", "true");

      frame ||= requestAnimationFrame(flush);
    };

    const onEnter = () => {
      element.style.setProperty("--tilt-lift", `${HOVER_LIFT}px`);
      element.style.setProperty("--tilt-scale", "1");
    };

    const onLeave = () => {
      element.removeAttribute("data-tilting");
      reset();
    };

    /**
     * Attaches only when the reader's current settings permit motion *and* a fine
     * pointer exists. Changing either setting re-evaluates, so a mouse plugged into a
     * tablet starts working without a reload.
     */
    const sync = () => {
      const active = !motion.matches && finePointer.matches;

      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerenter", onEnter);
      element.removeEventListener("pointerleave", onLeave);

      if (!active) {
        reset();
        element.style.removeProperty("--tilt-scale");

        return;
      }

      element.style.setProperty("--tilt-scale", "1");
      element.addEventListener("pointermove", onMove);
      element.addEventListener("pointerenter", onEnter);
      element.addEventListener("pointerleave", onLeave);
    };

    sync();
    motion.addEventListener("change", sync);
    finePointer.addEventListener("change", sync);

    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }

      motion.removeEventListener("change", sync);
      finePointer.removeEventListener("change", sync);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerenter", onEnter);
      element.removeEventListener("pointerleave", onLeave);
    };
  }, [ref]);
}
