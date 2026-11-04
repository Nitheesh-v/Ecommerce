import { apiClient, requestData, requestPage } from "@/lib/api/client";
import type { ApiSuccess } from "@/types/auth";
import type { Order } from "@/types/order";
import type {
  Customer,
  CustomerDetail,
  CustomerListQuery,
  CustomerOverview,
  CustomerStatus,
} from "@/types/customer";

function toParams(query: Partial<CustomerListQuery>) {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== undefined && value !== "" && value !== null,
    ),
  );
}

/**
 * Admin customer API (`/api/admin/customers`).
 *
 * Reads are server-paginated and spending figures are computed by the API, never
 * in the browser. The only write is an account-status change, which is audited and
 * revokes the customer's sessions on the server.
 */
export const customersService = {
  list(query: CustomerListQuery, signal?: AbortSignal) {
    return requestPage<Customer>(
      apiClient.get<ApiSuccess<Customer[]>>("/admin/customers", {
        signal,
        params: toParams(query),
      }),
    );
  },

  get(id: string, signal?: AbortSignal) {
    return requestData<CustomerDetail>(
      apiClient.get(`/admin/customers/${id}`, { signal }),
    );
  },

  summary(id: string) {
    return requestData<Customer>(apiClient.get(`/admin/customers/${id}/summary`));
  },

  analytics(signal?: AbortSignal) {
    return requestData<CustomerOverview>(
      apiClient.get("/admin/customers/summary", { signal }),
    );
  },

  orders(id: string, query: { page: number; limit: number }) {
    return requestPage<Order>(
      apiClient.get<ApiSuccess<Order[]>>(`/admin/customers/${id}/orders`, {
        params: query,
      }),
    );
  },

  updateStatus(
    id: string,
    payload: { status: CustomerStatus; reason?: string; note?: string },
  ) {
    return requestData<CustomerDetail>(
      apiClient.patch(`/admin/customers/${id}/status`, payload),
    );
  },

  /** Downloads the CSV the API generates (same filters as the table). */
  async exportCsv(query: Partial<CustomerListQuery>): Promise<string> {
    const response = await apiClient.get<Blob>("/admin/customers/export", {
      params: toParams(query),
      responseType: "blob",
    });
    const { data } = response;
    const url = URL.createObjectURL(data);
    const link = document.createElement("a");

    link.href = url;
    link.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    return link.download;
  },
};
