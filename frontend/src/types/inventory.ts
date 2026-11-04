/**
 * Inventory console types.
 *
 * The backend derives `stockStatus` from `stock` and `lowStockThreshold`, so the
 * UI never computes it independently — one definition, one badge:
 *
 * - `out` → quantity is 0
 * - `low` → 0 < quantity ≤ lowStockThreshold
 * - `in`  → quantity > lowStockThreshold
 */
export type StockStatus = "in" | "low" | "out";

export type StockSortField = "quantity" | "name" | "updatedAt" | "price";

export type MovementType =
  | "initial"
  | "adjustment"
  | "order"
  | "cancellation"
  | "return"
  | "correction";

export type AdjustmentAction = "increase" | "decrease" | "set";

export type AdjustmentReason =
  | "new_stock"
  | "damaged"
  | "manual_correction"
  | "returned"
  | "purchase_return"
  | "other";

/** One row of the inventory table. */
export interface InventoryRow {
  productId: string;
  name: string;
  slug: string;
  sku: string;
  categoryId: string;
  categoryName: string | null;
  /** Regular price in minor units (paise). */
  price: number;
  /** Landed cost in minor units — admin-only. */
  costPrice: number | null;
  stock: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
  status: string;
  imageUrl: string | null;
  updatedAt: string;
}

export interface InventoryCategoryGroup {
  categoryId: string;
  name: string;
  products: number;
  units: number;
  value: number;
}

export interface InventorySummary {
  totalProducts: number;
  totalUnits: number;
  inStockProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  /** Σ (cost price × units) — never shown to customers. */
  inventoryValue: number;
  /** Σ (regular price × units) — what the stock is worth at list price. */
  retailValue: number;
  byCategory: InventoryCategoryGroup[];
  topLowStock: Array<{
    productId: string;
    name: string;
    sku: string;
    stock: number;
    lowStockThreshold: number;
  }>;
  alerts: { low: number; out: number };
}

export interface InventoryAlert {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  level: "low" | "out";
  status: "open" | "resolved";
  quantity: number;
  lowStockThreshold: number;
  createdAt: string;
}

/** One audit row. Immutable: there is no update/delete endpoint for these. */
export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  type: MovementType;
  reason?: AdjustmentReason;
  notes?: string;
  direction: "increase" | "decrease";
  previousQuantity: number;
  changedQuantity: number;
  newQuantity: number;
  performedBy: { userId?: string; email?: string } | null;
  referenceId?: string;
  source?: string;
  createdAt: string;
}

export interface InventoryQuery {
  page: number;
  limit: number;
  /** Matches product name or SKU. */
  search?: string;
  categoryId?: string;
  stockStatus?: StockStatus;
  sortBy?: StockSortField;
  sortOrder?: "asc" | "desc";
}

export interface MovementQuery {
  page: number;
  limit: number;
  productId?: string;
  search?: string;
  type?: MovementType;
}

export interface AdjustStockPayload {
  productId: string;
  action: AdjustmentAction;
  quantity: number;
  reason: AdjustmentReason;
  notes?: string;
  referenceId?: string;
}

export interface AdjustmentResult {
  productId: string;
  productName: string;
  sku: string;
  previousQuantity: number;
  newQuantity: number;
  changedQuantity: number;
  stockStatus: StockStatus;
  lowStockThreshold: number;
  movement: StockMovement;
  alert: { level: "low" | "out" | null; created: boolean };
}

/** Fresh stock for the adjust dialog (never taken from a cached table row). */
export interface ProductStock {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  in: "In stock",
  low: "Low stock",
  out: "Out of stock",
};

export const ADJUSTMENT_ACTION_LABELS: Record<AdjustmentAction, string> = {
  increase: "Increase",
  decrease: "Decrease",
  set: "Set exact quantity",
};

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  new_stock: "New stock received",
  damaged: "Damaged products",
  manual_correction: "Manual correction",
  returned: "Returned products",
  purchase_return: "Purchase return",
  other: "Other",
};

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  initial: "Opening stock",
  adjustment: "Adjustment",
  order: "Order placed",
  cancellation: "Order cancelled",
  return: "Return / refund",
  correction: "Stock count correction",
};
