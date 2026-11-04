import { API_BASE_URL } from "@/lib/api/client";

/** `http://localhost:5000/api` → `http://localhost:5000` */
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

/**
 * Images are stored either as an absolute CDN URL (Cloudinary) or as an
 * API-relative path (`/uploads/…` for local storage). Both must render in the
 * browser, so relative paths are resolved against the API origin.
 */
export function resolveImageUrl(url?: string | null): string | null {
  if (!url) {
    return null;
  }

  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) {
    return url;
  }

  return `${API_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;
}
