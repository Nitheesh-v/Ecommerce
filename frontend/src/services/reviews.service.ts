import { apiClient, requestData } from "@/lib/api/client";
import type {
  AdminReview,
  ReviewEligibility,
  ReviewWritePayload,
} from "@/types/review";

/**
 * Customer-side review calls.
 *
 * The client only ever sends the star rating and the words — the customer, the
 * verifying order and the `pending` status are decided by the API. A review that
 * arrives without a delivered order is a 403 regardless of what the UI shows.
 */
export const customerReviewsService = {
  eligibility(productIdOrSlug: string, signal?: AbortSignal) {
    return requestData<ReviewEligibility>(
      apiClient.get(
        `/products/${encodeURIComponent(productIdOrSlug)}/reviews/eligibility`,
        { signal },
      ),
    );
  },

  submit(productIdOrSlug: string, payload: ReviewWritePayload) {
    return requestData<AdminReview>(
      apiClient.post(
        `/products/${encodeURIComponent(productIdOrSlug)}/reviews`,
        payload,
      ),
    );
  },
};
