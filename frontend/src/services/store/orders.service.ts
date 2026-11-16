// src/services/store/orders.service.ts

import { apiClient, requestData, requestPage } from "@/lib/api/client";
import type { ApiSuccess } from "@/types/auth";
import type { Invoice, Order } from "@/types/order";

/** One line of a return request: which product, how many. */
export interface ReturnRequestLine {
  productId: string;
  quantity: number;
}

/**
 * The customer's own orders.
 *
 * Every method is owner-scoped on the server: another customer's id answers 404, so
 * an id can never be probed from the browser. Nothing here sends a price, a status or
 * a refund amount — the API decides what a customer may do, and the UI only offers
 * what `canCancel` / `canRequestReturn` say.
 */
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

  /** Allowed only while the order has not shipped; the server answers 409 otherwise. */
  cancel(id: string, reason: string) {
    return requestData<Order>(apiClient.post(`/orders/${id}/cancel`, { reason }));
  },

  /** Allowed only for a delivered order with no return already in flight. */
  requestReturn(
    id: string,
    payload: { reason: string; items: ReturnRequestLine[]; note?: string },
  ) {
    return requestData<Order>(apiClient.post(`/orders/${id}/returns`, payload));
  },

  /**
   * A guest's own order, read back after checkout.
   *
   * There is no token to prove ownership, so the number *and* the email it was
   * placed with are the credential. The API refuses orders that belong to an
   * account, so knowing an email is never enough to read somebody's order.
   */
  guestLookup(orderNumber: string, email: string, signal?: AbortSignal) {
    return requestData<Order>(
      apiClient.get("/orders/guest", { signal, params: { orderNumber, email } }),
    );
  },

  /**
   * The invoice is built from the order's purchase-time snapshots, so it never
   * changes when the catalogue does.
   */
  invoice(id: string, signal?: AbortSignal) {
    return requestData<Invoice>(apiClient.get(`/orders/${id}/invoice`, { signal }));
  },
};
