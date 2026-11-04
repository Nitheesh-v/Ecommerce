import { apiClient, requestData, requestPage } from "@/lib/api/client";
import type { ApiSuccess } from "@/types/auth";
import type {
  AdminProduct,
  AdminProductListQuery,
  DeleteProductResult,
  ProductStatus,
  ProductWritePayload,
} from "@/types/product";

function toParams(query: AdminProductListQuery) {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== undefined && value !== "" && value !== null,
    ),
  );
}

export const productsService = {
  list(query: AdminProductListQuery, signal?: AbortSignal) {
    return requestPage<AdminProduct>(
      apiClient.get<ApiSuccess<AdminProduct[]>>("/admin/products", {
        signal,
        params: toParams(query),
      }),
    );
  },

  /**
   * Every product, paged through `limit=100` requests.
   *
   * Used by pickers that need the whole catalogue (the offer eligibility lists).
   * A single-vendor catalogue is small; if it ever stops being true this should
   * move to a searchable endpoint instead.
   */
  async listAll(signal?: AbortSignal): Promise<AdminProduct[]> {
    const collected: AdminProduct[] = [];
    let page = 1;
    let total = 0;

    do {
      const result = await this.list(
        { page, limit: 100, sortBy: "name", sortOrder: "asc" },
        signal,
      );

      collected.push(...result.data);
      total = result.meta.total;
      page += 1;
    } while (collected.length < total);

    return collected;
  },

  get(id: string) {
    return requestData<AdminProduct>(apiClient.get(`/admin/products/${id}`));
  },

  create(payload: ProductWritePayload) {
    return requestData<AdminProduct>(apiClient.post("/admin/products", payload));
  },

  update(id: string, payload: Partial<ProductWritePayload>) {
    return requestData<AdminProduct>(
      apiClient.patch(`/admin/products/${id}`, payload),
    );
  },

  updateStatus(id: string, status: ProductStatus) {
    return requestData<AdminProduct>(
      apiClient.patch(`/admin/products/${id}/status`, { status }),
    );
  },

  remove(id: string) {
    return requestData<DeleteProductResult>(
      apiClient.delete(`/admin/products/${id}`),
    );
  },
};
