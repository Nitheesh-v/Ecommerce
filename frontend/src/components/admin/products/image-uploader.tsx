"use client";

import { useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
} from "lucide-react";
import { getApiErrorMessage } from "@/lib/api/errors";
import { resolveImageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  uploadsService,
} from "@/services/admin/uploads.service";
import { toast } from "@/store/toast.store";
import type { ProductImage } from "@/types/product";

const MAX_IMAGES = 8;

const actionButton =
  "inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-slate-600 shadow-sm transition-colors hover:bg-white hover:text-slate-900 disabled:opacity-40";

/**
 * Multi-image gallery for a product.
 *
 * Files go to the API (`POST /admin/uploads/images`), which stores them on the
 * configured provider and returns a URL — only that URL is kept on the product,
 * never the bytes. Order is meaningful (first image is the storefront thumbnail)
 * and exactly one image is primary.
 */
export function ImageUploader({
  images,
  onChange,
  disabled = false,
}: {
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    const remaining = MAX_IMAGES - images.length;
    const selected = Array.from(files).slice(0, Math.max(remaining, 0));

    if (selected.length < files.length) {
      toast.info(`A product can have at most ${MAX_IMAGES} images.`);
    }

    setUploading((count) => count + selected.length);

    // Accumulate locally: `images` is a prop snapshot and will not update
    // between iterations of this loop.
    let next = images;

    for (const file of selected) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        toast.error(`${file.name}: use a JPEG, PNG, WEBP or AVIF image.`);
        setUploading((count) => count - 1);

        continue;
      }

      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name} is larger than 5 MB.`);
        setUploading((count) => count - 1);

        continue;
      }

      try {
        const uploaded = await uploadsService.uploadImage(file);
        next = normalize([
          ...next,
          { url: uploaded.url, publicId: uploaded.publicId, isPrimary: next.length === 0 },
        ]);
        onChange(next);
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      } finally {
        setUploading((count) => count - 1);
      }
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const setPrimary = (index: number) => {
    onChange(
      images.map((image, position) => ({ ...image, isPrimary: position === index })),
    );
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;

    if (target < 0 || target >= images.length) {
      return;
    }

    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(normalize(images.filter((_, position) => position !== index)));
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {images.map((image, index) => {
          const src = resolveImageUrl(image.url);

          return (
            <div
              key={`${image.url}-${index}`}
              className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src ?? ""}
                alt={image.alt ?? `Product image ${index + 1}`}
                loading="lazy"
                className="h-full w-full object-cover"
              />

              <div className="absolute inset-x-1 top-1 flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => setPrimary(index)}
                  disabled={disabled}
                  title={image.isPrimary ? "Primary image" : "Set as primary"}
                  aria-label={image.isPrimary ? "Primary image" : "Set as primary image"}
                  className={cn(
                    actionButton,
                    image.isPrimary && "bg-amber-400 text-white hover:bg-amber-400",
                  )}
                >
                  <Star
                    className={cn("h-3.5 w-3.5", image.isPrimary && "fill-white")}
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  disabled={disabled}
                  title="Remove image"
                  aria-label={`Remove image ${index + 1}`}
                  className={cn(actionButton, "hover:text-rose-600")}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>

              <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={disabled || index === 0}
                  title="Move earlier"
                  aria-label="Move image earlier"
                  className={actionButton}
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                </button>
                <span className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                  {index === 0 ? "Thumbnail" : `#${index + 1}`}
                </span>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={disabled || index === images.length - 1}
                  title="Move later"
                  aria-label="Move image later"
                  className={actionButton}
                >
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          );
        })}

        {images.length < MAX_IMAGES ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading > 0}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300",
              "text-slate-500 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60",
            )}
          >
            {uploading > 0 ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="h-5 w-5" aria-hidden />
            )}
            <span className="px-2 text-center text-[11px] leading-tight">
              {uploading > 0 ? "Uploading…" : "Upload image"}
            </span>
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple
        hidden
        onChange={(event) => void uploadFiles(event.target.files)}
      />

      <p className="text-xs text-slate-500">
        JPEG, PNG, WEBP or AVIF up to 5 MB. The first image is the storefront
        thumbnail; star another one to change the primary image.
      </p>
    </div>
  );
}

/** Guarantees exactly one primary image (first one when none is marked). */
function normalize(images: ProductImage[]): ProductImage[] {
  if (images.length === 0) {
    return images;
  }

  const primaryIndex = images.findIndex((image) => image.isPrimary);
  const resolved = primaryIndex === -1 ? 0 : primaryIndex;

  return images.map((image, index) => ({
    ...image,
    isPrimary: index === resolved,
  }));
}
