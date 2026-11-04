"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { getApiErrorMessage } from "@/lib/api/errors";
import { resolveImageUrl } from "@/lib/images";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  uploadsService,
} from "@/services/admin/uploads.service";
import { toast } from "@/store/toast.store";
import type { CategoryImage } from "@/types/category";

/**
 * Single-image field for a category.
 *
 * The file is posted to `POST /api/admin/uploads/images`; only the returned
 * `{ url, publicId }` is kept on the category, so no binary ever reaches MongoDB.
 * "Replace" is simply uploading again — the old reference is dropped.
 */
export function CategoryImageField({
  value,
  onChange,
  disabled = false,
}: {
  value: CategoryImage | null;
  onChange: (next: CategoryImage | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Use a JPEG, PNG, WEBP or AVIF image.");

      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image is larger than 5 MB.");

      return;
    }

    setUploading(true);

    try {
      const uploaded = await uploadsService.uploadImage(file);

      onChange({ url: uploaded.url, publicId: uploaded.publicId, alt: value?.alt });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setUploading(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const preview = resolveImageUrl(value?.url);

  return (
    <div className="flex items-start gap-3">
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-slate-300">
            <ImagePlus className="h-6 w-6" aria-hidden />
          </span>
        )}
        {uploading ? (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-hidden />
          </span>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            {value ? "Replace image" : "Upload image"}
          </button>

          {value ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={disabled || uploading}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Remove
            </button>
          ) : null}
        </div>

        <p className="text-xs text-slate-500">JPEG, PNG, WEBP or AVIF · up to 5 MB</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        hidden
        onChange={(event) => void upload(event.target.files?.[0])}
      />
    </div>
  );
}
