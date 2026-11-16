"use client";

// src/components/store/share-product.tsx

/**
 * Copy-link share control.
 *
 * A shopper who wants a second opinion texts the product to a friend. Without
 * this they copy the address bar; on a phone that is a fiddly long-press. Where
 * the platform supports it (`navigator.share`, i.e. mobile Safari/Chrome) the
 * native sheet is used; everywhere else the URL goes to the clipboard and the
 * button says so for a moment.
 *
 * No tracking, no third-party share SDKs, no popup.
 */
import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { toast } from "@/store/toast.store";

export function ShareProduct({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    const url = window.location.href;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: name, url });
      } catch {
        // The shopper dismissed the sheet — not an error, and not worth a toast.
      }

      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied to your clipboard");
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      toast.error("Could not copy the link — copy it from the address bar instead");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-cream-300 px-3 py-2.5 text-xs font-medium text-bark-800 transition-colors hover:border-bark-300 hover:bg-cream-100"
      aria-label={`Share ${name}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
      ) : (
        <Share2 className="h-3.5 w-3.5" aria-hidden />
      )}
      <span className="hidden sm:inline">{copied ? "Copied" : "Share"}</span>
    </button>
  );
}
