import { Star } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { reviewsStorefront } from "@/services/store/reviews.service";
import { ReviewForm } from "./review-form";

/**
 * Ratings & reviews block on the product page.
 *
 * Server-rendered from the public API, which only ever returns approved reviews.
 * The maths (average, distribution) is computed by the API too — this component
 * formats numbers, it does not count.
 */
export async function ProductReviews({ productSlug }: { productSlug: string }) {
  const [rating, reviews] = await Promise.all([
    reviewsStorefront.rating(productSlug),
    reviewsStorefront.reviews(productSlug),
  ]);

  return (
    <section
      id="reviews"
      aria-labelledby="reviews-heading"
      className="space-y-4 border-t border-cream-300 pt-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="reviews-heading" className="text-sm font-semibold text-bark-900">
          Ratings &amp; reviews
        </h2>
        {rating.reviewCount > 0 ? (
          <p className="inline-flex items-center gap-1 text-xs text-bark-700">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
            <span className="font-medium text-bark-900">
              {rating.averageRating?.toFixed(1)}
            </span>
            from {rating.reviewCount} {rating.reviewCount === 1 ? "review" : "reviews"}
          </p>
        ) : null}
      </div>

      {rating.reviewCount === 0 ? (
        <p className="text-xs text-bark-500">
          No reviews yet. Reviews are written by customers who received this product
          and are published after moderation.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
          <ul className="space-y-1" aria-label="Rating distribution">
            {rating.distribution.map((entry) => (
              <li key={entry.stars} className="flex items-center gap-2 text-xs text-bark-700">
                <span className="w-8 shrink-0">{entry.stars} ★</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-200">
                  <span
                    className="block h-full rounded-full bg-amber-400"
                    style={{ width: `${entry.percent}%` }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right tabular-nums text-bark-500">
                  {entry.count}
                </span>
              </li>
            ))}
          </ul>

          <ul className="space-y-3">
            {reviews.items.map((review) => (
              <li
                key={review.id}
                className="rounded-xl border border-cream-300 bg-cream-50 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1" aria-label={review.ratingLabel}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={
                          star <= review.rating
                            ? "h-3 w-3 fill-amber-400 text-amber-400"
                            : "h-3 w-3 text-cream-400"
                        }
                        aria-hidden
                      />
                    ))}
                    <span className="ml-1 text-xs font-medium text-bark-800">
                      {review.title ?? review.ratingLabel}
                    </span>
                  </span>
                  <span className="text-xs text-bark-400">
                    {formatDate(review.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-bark-700">{review.comment}</p>
                <p className="mt-1 text-xs text-bark-500">
                  {review.author}
                  {review.verifiedPurchase ? " · Verified purchase" : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ReviewForm productSlug={productSlug} />
    </section>
  );
}
