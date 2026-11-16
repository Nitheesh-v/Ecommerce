// src/components/store/product-gallery.tsx

"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GalleryImage {
  url: string;
  alt?: string;
}

/**
 * Product gallery: one large frame with a thumbnail strip beneath it.
 *
 * The main frame keeps a fixed aspect ratio so swapping images never shifts the
 * layout, and the thumbnails are real buttons with `aria-pressed`, so the strip is
 * keyboard operable and announces which image is showing.
 */
export function ProductGallery({
  images,
  name,
}: {
  images: GalleryImage[];
  name: string;
}) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];

  if (!current) {
    return (
      <div className="flex aspect-[4/5] items-center justify-center rounded-[24px] border border-cream-300 bg-cream-100">
        <ImageOff className="h-8 w-8 text-bark-300" aria-hidden />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[24px] border border-cream-300 bg-cream-100">
        <div className="relative aspect-[4/5]">
          <Image
            key={current.url}
            src={current.url}
            alt={current.alt ?? name}
            fill
            priority
            sizes="(min-width: 1024px) 46vw, 100vw"
            className="object-cover"
          />
        </div>
      </div>

      {images.length > 1 ? (
        <ul className="flex gap-2.5 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <li key={image.url} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-pressed={index === active}
                aria-label={`Show image ${index + 1} of ${images.length}`}
                className={cn(
                  "relative h-16 w-16 cursor-pointer overflow-hidden rounded-xl border transition-colors sm:h-20 sm:w-20",
                  index === active
                    ? "border-bark-900 ring-2 ring-bark-900/15"
                    : "border-cream-300 hover:border-bark-300",
                )}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
