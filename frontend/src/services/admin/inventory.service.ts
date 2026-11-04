import { apiClient, requestData, requestPage } from "@/lib/api/client";
import type { ApiSuccess } from "@/types/auth";
import type {
  AdjustmentResult,
  AdjustStockPayload,
  InventoryAlert,
  InventoryQuery,
  InventoryRow,
  InventorySummary,
  MovementQuery,
  ProductStock,
  StockMovement,
} from "@/types/inventory";

function toParams(query: InventoryQuery | MovementQuery) {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== undefined && value !== "" && value !== null,
    ),
  );
}

/**
 * Admin inventory API (`/api/admin/inventory`).
 *
 * Read-only helpers plus a *single* write: `adjust`. Stock is never written
 * through the product endpoints — the server rejects that — so this is the only
 * path the console uses to change a quantity.
 */
export const inventoryService = {
  list(query: InventoryQuery, signal?: AbortSignal) {
    return requestPage<InventoryRow>(
      apiClient.get<ApiSuccess<InventoryRow[]>>("/admin/inventory", {
        signal,
        params: toParams(query),
      }),
    );
  },

  summary(signal?: AbortSignal) {
    return requestData<InventorySummary>(
      apiClient.get("/admin/inventory/summary", { signal }),
    );
  },

  alerts(signal?: AbortSignal) {
    return requestData<InventoryAlert[]>(
      apiClient.get("/admin/inventory/alerts", { signal }),
    );
  },

  history(query: MovementQuery, signal?: AbortSignal) {
    return requestPage<StockMovement>(
      apiClient.get<ApiSuccess<StockMovement[]>>("/admin/inventory/history", {
        signal,
        params: toParams(query),
      }),
    );
  },

  /** Current quantity of one product — read fresh when the adjust dialog opens. */
  productStock(productId: string, signal?: AbortSignal) {
    return requestData<ProductStock>(
      apiClient.get(`/admin/inventory/products/${productId}`, { signal }),
    );
  },

  /**
   * Applies an adjustment and returns the audited result.
   *
   * `quantity` is an intent (delta, or the counted value for `set`), never the
   * resulting quantity: the server computes and validates the outcome, so a stale
   * table row cannot overwrite a concurrent change.
   */
  adjust(payload: AdjustStockPayload) {
    return requestData<AdjustmentResult>(
      apiClient.post("/admin/inventory/adjust", payload),
    );
  },
};
