import type { AdjustmentReason, MovementType } from '../schemas/inventory-movement.schema.js';
import type { AlertLevel, AlertStatus } from '../schemas/inventory-alert.schema.js';

/** Derived from the stored quantity and the product's own threshold. */
export type StockStatus = 'in' | 'low' | 'out';

export const STOCK_SORT_FIELDS = ['quantity', 'name', 'updatedAt', 'price'] as const;
export type StockSortField = (typeof STOCK_SORT_FIELDS)[number];

export interface InventoryQuery {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  stockStatus?: StockStatus;
  sortBy: StockSortField;
  sortOrder: 'asc' | 'desc';
}

/** One row of the inventory table (product data + derived stock status). */
export interface InventoryRow {
  productId: string;
  name: string;
  slug: string;
  sku: string;
  categoryId: string;
  categoryName: string | null;
  /** Regular price, minor units. */
  price: number;
  /** Admin-only landed cost, minor units. */
  costPrice: number | null;
  stock: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
  status: string;
  imageUrl: string | null;
  updatedAt: Date;
}

export interface InventorySummary {
  totalProducts: number;
  totalUnits: number;
  inStockProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  /** Σ (costPrice × stock); products without a cost price contribute 0. */
  inventoryValue: number;
  /** Σ (price × stock) — what the stock would sell for at list price. */
  retailValue: number;
  byCategory: Array<{
    categoryId: string;
    name: string;
    products: number;
    units: number;
    value: number;
  }>;
  topLowStock: Array<{
    productId: string;
    name: string;
    sku: string;
    stock: number;
    lowStockThreshold: number;
  }>;
}

/** The minimal product state an adjustment needs. */
export interface InventoryProduct {
  productId: string;
  name: string;
  sku: string;
  stock: number;
  lowStockThreshold: number;
}

export interface StockMutation {
  previous: number;
  next: number;
  product: InventoryProduct;
}

export interface MovementInput {
  productId: string;
  productName: string;
  sku: string;
  type: MovementType;
  reason?: AdjustmentReason;
  notes?: string;
  direction: 'increase' | 'decrease';
  previousQuantity: number;
  changedQuantity: number;
  newQuantity: number;
  performedBy?: { userId?: string; email?: string } | null;
  referenceId?: string;
  source?: string;
}

export interface MovementRecord {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  type: MovementType;
  reason?: AdjustmentReason;
  notes?: string;
  direction: 'increase' | 'decrease';
  previousQuantity: number;
  changedQuantity: number;
  newQuantity: number;
  performedBy: { userId?: string; email?: string } | null;
  referenceId?: string;
  source?: string;
  createdAt: Date;
}

export interface MovementQuery {
  page: number;
  limit: number;
  productId?: string;
  search?: string;
  type?: MovementType;
  from?: Date;
  to?: Date;
}

export interface AlertRecord {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  level: AlertLevel;
  status: AlertStatus;
  quantity: number;
  lowStockThreshold: number;
  createdAt: Date;
}

/**
 * Persistence boundary for inventory.
 *
 * The **product collection stays the source of truth for `stock`** — this module
 * never keeps a second quantity. It only:
 * 1. mutates `products.stock` atomically,
 * 2. appends an immutable movement record,
 * 3. maintains deduplicated alerts.
 *
 * Abstract class = Nest DI token; e2e tests swap in an in-memory implementation.
 */
export abstract class InventoryRepository {
  abstract listProducts(
    query: InventoryQuery,
  ): Promise<{ items: InventoryRow[]; total: number }>;

  abstract summary(): Promise<InventorySummary>;

  abstract findProduct(productId: string): Promise<InventoryProduct | null>;

  /** `null` when the product does not exist. */
  abstract increase(productId: string, quantity: number): Promise<StockMutation | null>;

  /**
   * Atomic guarded decrement: returns `null` when the product does not exist,
   * and `insufficient: true` when the quantity is below the requested amount.
   */
  abstract decrease(
    productId: string,
    quantity: number,
  ): Promise<StockMutation | { insufficient: true; available: number } | null>;

  abstract setQuantity(
    productId: string,
    quantity: number,
  ): Promise<StockMutation | null>;

  /**
   * Appends the audit row. `created: false` means the `(referenceId, type)`
   * pair already existed — the caller's stock write must then be compensated,
   * because the original event already moved the stock.
   */
  /**
   * Unconditional atomic delta, used **only** to compensate a stock write whose
   * audit row turned out to be a duplicate replay. Never exposed to clients.
   */
  abstract applyDelta(productId: string, delta: number): Promise<void>;

  abstract recordMovement(
    input: MovementInput,
  ): Promise<{ movement: MovementRecord; created: boolean }>;

  /** Used for idempotent replays (same external event, same movement type). */
  abstract findMovement(
    referenceId: string,
    type: MovementType,
  ): Promise<MovementRecord | null>;

  abstract listMovements(
    query: MovementQuery,
  ): Promise<{ items: MovementRecord[]; total: number }>;

  /**
   * Creates the open alert when absent. Returns `created: false` when it already
   * exists, so the caller only notifies on real state changes.
   */
  abstract openAlert(input: {
    productId: string;
    productName: string;
    sku: string;
    level: AlertLevel;
    quantity: number;
    lowStockThreshold: number;
  }): Promise<{ alert: AlertRecord; created: boolean }>;

  /**
   * Marks open alerts of the product resolved; returns how many changed.
   * Pass `level` to resolve only that level (used when `low` escalates to `out`).
   */
  abstract resolveAlerts(productId: string, level?: AlertLevel): Promise<number>;

  abstract listAlerts(options?: { level?: AlertLevel }): Promise<AlertRecord[]>;
}
