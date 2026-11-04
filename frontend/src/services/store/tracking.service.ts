import { apiClient, requestData } from "@/lib/api/client";
import type { OrderTracking } from "@/types/shipment";

/**
 * Customer tracking API (`GET /api/orders/:id/tracking`).
 *
 * Owner-scoped on the server: another customer's order is a `404`, so an id
 * cannot be probed from the browser. The response is a customer-safe projection —
 * no cost, no internal notes, no staff identities — and there is no write method
 * here at all: a customer can never move a parcel.
 */
export const trackingService = {
  get(orderId: string, signal?: AbortSignal) {
    return requestData<OrderTracking>(
      apiClient.get(`/orders/${orderId}/tracking`, { signal }),
    );
  },
};
