import { apiClient, requestData, requestPage } from "@/lib/api/client";
import type { ApiSuccess } from "@/types/auth";
import type {
  CourierOptions,
  CreateShipmentInput,
  EligibleOrder,
  Shipment,
  ShipmentDetail,
  ShipmentListQuery,
  ShipmentSummary,
  UpdateShipmentCourierInput,
  UpdateShipmentStatusInput,
} from "@/types/shipment";

function toParams(query: Partial<ShipmentListQuery>) {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== undefined && value !== "" && value !== null,
    ),
  );
}

/**
 * Admin shipment API (`/api/admin/shipments`).
 *
 * Every mutation is a validated transition: nothing here can set an arbitrary
 * status, edit history or invent a tracking update. Creation copies the order's
 * address server-side, so no address is ever sent from the browser.
 */
export const shipmentsService = {
  list(query: ShipmentListQuery, signal?: AbortSignal) {
    return requestPage<Shipment>(
      apiClient.get<ApiSuccess<Shipment[]>>("/admin/shipments", {
        signal,
        params: toParams(query),
      }),
    );
  },

  summary(signal?: AbortSignal) {
    return requestData<ShipmentSummary>(
      apiClient.get("/admin/shipments/summary", { signal }),
    );
  },

  couriers(signal?: AbortSignal) {
    return requestData<CourierOptions>(
      apiClient.get("/admin/shipments/couriers", { signal }),
    );
  },

  eligible(signal?: AbortSignal, search?: string) {
    return requestData<EligibleOrder[]>(
      apiClient.get("/admin/shipments/eligible", {
        signal,
        params: toParams({ search }),
      }),
    );
  },

  get(id: string, signal?: AbortSignal) {
    return requestData<ShipmentDetail>(
      apiClient.get(`/admin/shipments/${id}`, { signal }),
    );
  },

  history(id: string, signal?: AbortSignal) {
    return requestData<{ events: ShipmentDetail["events"] }>(
      apiClient.get(`/admin/shipments/${id}/history`, { signal }),
    );
  },

  create(input: CreateShipmentInput) {
    return requestData<ShipmentDetail>(apiClient.post("/admin/shipments", input));
  },

  updateStatus(id: string, input: UpdateShipmentStatusInput) {
    return requestData<ShipmentDetail>(
      apiClient.patch(`/admin/shipments/${id}/status`, input),
    );
  },

  updateCourier(id: string, input: UpdateShipmentCourierInput) {
    return requestData<ShipmentDetail>(
      apiClient.patch(`/admin/shipments/${id}/courier`, input),
    );
  },
};
