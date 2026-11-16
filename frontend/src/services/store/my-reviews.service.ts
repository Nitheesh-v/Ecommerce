// src/services/store/my-reviews.service.ts

import { apiClient } from "@/lib/api/client";
import type { ApiSuccess, PaginationMeta } from "@/types/auth";
import type { MyReview, MyReviewListQuery } from "@/types/review";

/**
 * The customer's own reviews.
 *
 * Browser-side rather than `fetchPublic`: the feed is per-account, so it needs the
 * session token, and a review that is still pending is not public information.
 */
export const myReviewsService = {
  async list(
    query: MyReviewListQuery = {},
    signal?: AbortSignal,
  ): Promise<{ data: MyReview[]; meta: PaginationMeta | undefined }> {
    const response = await apiClient.get<ApiSuccess<MyReview[]> & { meta: PaginationMeta }>(
      "/reviews/mine",
      { signal, params: query },
    );

    return { data: response.data.data ?? [], meta: response.data.meta };
  },
};
