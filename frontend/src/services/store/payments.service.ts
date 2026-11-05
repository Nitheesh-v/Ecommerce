import { apiClient, requestData, requestPage } from "@/lib/api/client";
import type { ApiSuccess } from "@/types/auth";
import type { Order } from "@/types/order";
import type {
  CheckoutConfig,
  CheckoutSession,
  VerifyPaymentResult,
} from "@/types/payment";

/**
 * Customer checkout API (`/api/payments`).
 *
 * The amount is never sent: the server prices the stored order and returns the
 * gateway order id. The browser only ever receives the *publishable* key id.
 */
export const checkoutService = {
  config(signal?: AbortSignal) {
    return requestData<CheckoutConfig>(apiClient.get("/payments/config", { signal }));
  },

  createOrder(orderId: string) {
    return requestData<CheckoutSession>(
      apiClient.post("/payments/create-order", { orderId }),
    );
  },

  /**
   * The checkout callback is verified server-side — signature first, then a fresh
   * read from the gateway. This call is the only way a browser can influence the
   * payment status, and it influences nothing by itself.
   */
  verify(payload: {
    gatewayOrderId: string;
    gatewayPaymentId: string;
    signature: string;
  }) {
    return requestData<VerifyPaymentResult>(
      apiClient.post("/payments/verify", payload),
    );
  },
};

/** The customer's own orders (someone else's id is a 404, by design). */
export const myOrdersService = {
  get(id: string, signal?: AbortSignal) {
    return requestData<Order>(apiClient.get(`/orders/${id}`, { signal }));
  },

  list(page = 1, limit = 10, signal?: AbortSignal) {
    return requestPage<Order>(
      apiClient.get<ApiSuccess<Order[]>>("/orders", {
        signal,
        params: { page, limit },
      }),
    );
  },
};
