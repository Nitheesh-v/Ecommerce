import { apiClient, requestData, requestPage } from "@/lib/api/client";
import type { ApiSuccess } from "@/types/auth";
import type {
  AdminCategory,
  CategoryListQuery,
  CategoryStatus,
  CategoryWritePayload,
  DeleteCategoryResult,
} from "@/types/category";

/** Admin list cap enforced by the API (`limit <= 100`). */
const MAX_PAGE_SIZE = 100;

function toParams(query: CategoryListQuery) {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== undefined && value !== "" && value !== null,
    ),
  );
}

export const categoriesService = {
  list(query: CategoryListQuery, signal?: AbortSignal) {
    return requestPage<AdminCategory>(
      apiClient.get<ApiSuccess<AdminCategory[]>>("/admin/categories", {
        signal,
        params: toParams(query),
      }),
    );
  },

  /**
   * Every category, paged through `limit=100` requests.
   *
   * Used where a complete list is required (product form picker, parent select,
   * tree views). Catalogues here are small; if that ever stops being true the
   * picker should move to a searchable endpoint.
   */
  async listAll(signal?: AbortSignal): Promise<AdminCategory[]> {
    const collected: AdminCategory[] = [];
    let page = 1;
    let total = 0;

    do {
      const result = await this.list(
        { page, limit: MAX_PAGE_SIZE, sortBy: "name", sortOrder: "asc" },
        signal,
      );

      collected.push(...result.data);
      total = result.meta.total;
      page += 1;
    } while (collected.length < total);

    return collected;
  },

  get(id: string) {
    return requestData<AdminCategory>(apiClient.get(`/admin/categories/${id}`));
  },

  create(payload: CategoryWritePayload) {
    return requestData<AdminCategory>(apiClient.post("/admin/categories", payload));
  },

  update(id: string, payload: CategoryWritePayload) {
    return requestData<AdminCategory>(
      apiClient.patch(`/admin/categories/${id}`, payload),
    );
  },

  updateStatus(id: string, status: CategoryStatus) {
    return requestData<AdminCategory>(
      apiClient.patch(`/admin/categories/${id}/status`, { status }),
    );
  },

  remove(id: string) {
    return requestData<DeleteCategoryResult>(
      apiClient.delete(`/admin/categories/${id}`),
    );
  },
};

/**
 * A category and all of its descendants, computed from a flat list.
 * Used to keep a category out of its own parent picker.
 */
export function descendantIdsOf(
  categoryId: string,
  all: Array<{ id: string; parentId: string | null }>,
): Set<string> {
  const blocked = new Set<string>([categoryId]);
  let changed = true;

  while (changed) {
    changed = false;

    for (const category of all) {
      if (
        category.parentId &&
        blocked.has(category.parentId) &&
        !blocked.has(category.id)
      ) {
        blocked.add(category.id);
        changed = true;
      }
    }
  }

  return blocked;
}
