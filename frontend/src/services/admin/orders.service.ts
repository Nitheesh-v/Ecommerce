import { apiClient, requestData, requestPage } from "@/lib/api/client";
import type { ApiSuccess } from "@/types/auth";
import type {
  Invoice,
  Order,
  OrderHistoryEntry,
  OrderListQuery,
  OrderStatus,
  PaymentStatus,
} from "@/types/order";

function toParams(query: OrderListQuery) {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== undefined && value !== "" && value !== null,
    ),
  );
}

/**
 * Admin order API (`/api/admin/orders`).
 *
 * Every mutation here is a *decision* the server validates: transitions go through
 * the state machine, cancellations restore stock exactly once, refunds are capped
 * and processed once. The console never edits an order locally.
 */
export const ordersService = {
  list(query: OrderListQuery, signal?: AbortSignal) {
    return requestPage<Order>(
      apiClient.get<ApiSuccess<Order[]>>("/admin/orders", {
        signal,
        params: toParams(query),
      }),
    );
  },

  get(id: string, signal?: AbortSignal) {
    return requestData<Order>(apiClient.get(`/admin/orders/${id}`, { signal }));
  },

  history(id: string) {
    return requestData<OrderHistoryEntry[]>(
      apiClient.get(`/admin/orders/${id}/history`),
    );
  },

  invoice(id: string) {
    return requestData<Invoice>(apiClient.get(`/admin/orders/${id}/invoice`));
  },

  updateStatus(
    id: string,
    payload: { status: OrderStatus; reason?: string; note?: string },
  ) {
    return requestData<Order>(apiClient.patch(`/admin/orders/${id}/status`, payload));
  },

  cancel(id: string, payload: { reason: string; note?: string }) {
    return requestData<Order>(apiClient.post(`/admin/orders/${id}/cancel`, payload));
  },

  updateShipping(
    id: string,
    payload: {
      provider?: string;
      trackingNumber?: string;
      trackingUrl?: string;
      shippedAt?: string;
      estimatedDelivery?: string;
      note?: string;
    },
  ) {
    return requestData<Order>(apiClient.patch(`/admin/orders/${id}/shipping`, payload));
  },

  updatePayment(
    id: string,
    payload: { status: "paid" | "failed"; transactionId?: string; note?: string },
  ) {
    return requestData<Order>(apiClient.patch(`/admin/orders/${id}/payment`, payload));
  },

  createRefund(id: string, payload: { amount: number; reason: string }) {
    return requestData<Order>(apiClient.post(`/admin/orders/${id}/refunds`, payload));
  },

  updateRefund(
    id: string,
    refundId: string,
    payload: { status: "processed" | "failed"; reference?: string; note?: string },
  ) {
    return requestData<Order>(
      apiClient.patch(`/admin/orders/${id}/refunds/${refundId}`, payload),
    );
  },

  requestReturn(
    id: string,
    payload: {
      reason: string;
      note?: string;
      items: Array<{ productId: string; quantity: number }>;
    },
  ) {
    return requestData<Order>(apiClient.post(`/admin/orders/${id}/returns`, payload));
  },

  updateReturn(
    id: string,
    returnId: string,
    payload: {
      action: "approve" | "reject" | "receive" | "inspect" | "complete";
      note?: string;
      inspectionNotes?: string;
      restockApproved?: boolean;
    },
  ) {
    return requestData<Order>(
      apiClient.patch(`/admin/orders/${id}/returns/${returnId}`, payload),
    );
  },
};

export type { PaymentStatus };
