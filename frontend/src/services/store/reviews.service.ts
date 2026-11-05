import { cacheLife, cacheTag } from "next/cache";
import { fetchPublic, fetchPublicEnvelope } from "@/lib/api/public";
import type { ProductRating, PublicReview } from "@/types/review";

interface ReviewPage {
  items: PublicReview[];
  total: number;
}

/**
 * Storefront review reads.
 *
 * Only approved reviews are reachable here — the API enforces that, the UI does not
 * filter. Reads are cached like the rest of the catalogue so the product page stays
 * prerenderable; approving a review therefore shows up within the cache window.
 */
async function readRating(productSlug: string): Promise<ProductRating> {
  "use cache";
  cacheLife("minutes");
  cacheTag("reviews", `reviews:${productSlug}`);

  return fetchPublic<ProductRating>(
    `/products/${encodeURIComponent(productSlug)}/reviews/summary`,
    undefined,
    {
      fallback: {
        productId: "",
        reviewCount: 0,
        averageRating: null,
        distribution: [5, 4, 3, 2, 1].map((stars) => ({
          stars,
          count: 0,
          percent: 0,
        })),
      },
    },
  );
}

async function readReviews(productSlug: string, limit = 6): Promise<ReviewPage> {
  "use cache";
  cacheLife("minutes");
  cacheTag("reviews", `reviews:${productSlug}`);

  const envelope = await fetchPublicEnvelope<PublicReview[]>(
    `/products/${encodeURIComponent(productSlug)}/reviews`,
    { limit },
    // A restarting API degrades to "no reviews" rather than failing the page.
    { fallback: [] },
  );

  return { items: envelope.data ?? [], total: envelope.meta?.total ?? 0 };
}

export const reviewsStorefront = {
  rating: readRating,
  reviews: readReviews,
};
