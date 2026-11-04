import { apiClient, requestData } from "@/lib/api/client";
import type { Category } from "@/types/product";

export const categoriesService = {
  /** Admin list: includes inactive categories so existing products stay editable. */
  list(status?: "active" | "inactive") {
    return requestData<Category[]>(
      apiClient.get("/admin/categories", { params: status ? { status } : {} }),
    );
  },
};
