import { apiClient, requestData, requestPage } from "@/lib/api/client";
import type { ApiSuccess } from "@/types/auth";
import type {
  AdminReview,
  ReviewListQuery,
  ReviewStatus,
  ReviewSummary,
} from "@/types/review";

function toParams(query: object) {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== undefined && value !== "" && value !== null,
    ),
  );
}

/** Review moderation console. */
export const reviewsService = {
  list(query: ReviewListQuery, signal?: AbortSignal) {
    return requestPage<AdminReview>(
      apiClient.get<ApiSuccess<AdminReview[]>>("/admin/reviews", {
        signal,
        params: toParams(query),
      }),
    );
  },

  summary(signal?: AbortSignal) {
    return requestData<ReviewSummary>(
      apiClient.get("/admin/reviews/summary", { signal }),
    );
  },

  get(id: string, signal?: AbortSignal) {
    return requestData<AdminReview>(apiClient.get(`/admin/reviews/${id}`, { signal }));
  },

  /** Approve or reject. A rejection needs a reason; the API enforces it too. */
  moderate(id: string, status: Exclude<ReviewStatus, "pending">, reason?: string) {
    return requestData<AdminReview>(
      apiClient.patch(`/admin/reviews/${id}`, {
        status,
        ...(reason ? { reason } : {}),
      }),
    );
  },

  remove(id: string) {
    return requestData<{ deleted: true }>(apiClient.delete(`/admin/reviews/${id}`));
  },
};
