import { apiClient, requestData, requestPage } from "@/lib/api/client";
import type { ApiSuccess } from "@/types/auth";
import type {
  Payment,
  PaymentDetail,
  PaymentListQuery,
  PaymentSummary,
  RefundPaymentResult,
} from "@/types/payment";

function toParams(query: Partial<PaymentListQuery>) {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== undefined && value !== "" && value !== null,
    ),
  );
}

/**
 * Admin payment API (`/api/admin/payments`).
 *
 * Read-only apart from `refund`: there is deliberately no method that changes a
 * payment status, because only the gateway can. Refunds always go through the
 * server, which calls Razorpay and records the gateway's own refund id.
 */
export const paymentsService = {
  list(query: PaymentListQuery, signal?: AbortSignal) {
    return requestPage<Payment>(
      apiClient.get<ApiSuccess<Payment[]>>("/admin/payments", {
        signal,
        params: toParams(query),
      }),
    );
  },

  summary(signal?: AbortSignal) {
    return requestData<PaymentSummary>(
      apiClient.get("/admin/payments/summary", { signal }),
    );
  },

  get(id: string, signal?: AbortSignal) {
    return requestData<PaymentDetail>(
      apiClient.get(`/admin/payments/${id}`, { signal }),
    );
  },

  history(id: string, signal?: AbortSignal) {
    return requestData<Pick<PaymentDetail, "events" | "timeline">>(
      apiClient.get(`/admin/payments/${id}/history`, { signal }),
    );
  },

  refund(id: string, payload: { amount: number; reason: string; note?: string }) {
    return requestData<RefundPaymentResult>(
      apiClient.post(`/admin/payments/${id}/refund`, payload),
    );
  },
};
