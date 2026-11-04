import { randomBytes } from 'node:crypto';
import {
  InventoryRepository,
  type AlertRecord,
  type InventoryProduct,
  type InventoryQuery,
  type InventoryRow,
  type InventorySummary,
  type MovementInput,
  type MovementQuery,
  type MovementRecord,
  type StockMutation,
} from '../../src/modules/inventory/repositories/inventory.repository.js';
import type { AlertLevel } from '../../src/modules/inventory/schemas/inventory-alert.schema.js';
import type { MovementType } from '../../src/modules/inventory/schemas/inventory-movement.schema.js';
import type { InMemoryProductsRepository } from './in-memory-products.repository.js';
import type { ProductRecord } from '../../src/modules/products/repositories/products.repository.js';

type AlertStore = AlertRecord;

/**
 * In-memory stand-in for `MongoInventoryRepository`.
 *
 * It is written against the *same* product store as `InMemoryProductsRepository`
 * (there is no second quantity anywhere), so the tests exercise the real rule
 * "stock lives on the product". Each quantity change goes through `mutateStock`,
 * which is the fake of the atomic `findOneAndUpdate`.
 */
export class InMemoryInventoryRepository implements InventoryRepository {
  private readonly movements: MovementRecord[] = [];
  private readonly alerts = new Map<string, AlertStore>();

  constructor(
    private readonly products: InMemoryProductsRepository,
    private readonly categoryName: (categoryId: string) => string | null = () => null,
  ) {}

  // -------------------------------------------------------------- products

  async listProducts(
    query: InventoryQuery,
  ): Promise<{ items: InventoryRow[]; total: number }> {
    const search = query.search?.trim().toLowerCase();
    let rows = this.products
      .all()
      .filter((product) => product.status !== 'archived')
      .map((product) => this.toRow(product));

    if (query.categoryId) {
      rows = rows.filter((row) => row.categoryId === query.categoryId);
    }
    if (search) {
      rows = rows.filter(
        (row) =>
          row.name.toLowerCase().includes(search) ||
          row.sku.toLowerCase().includes(search),
      );
    }
    if (query.stockStatus) {
      rows = rows.filter((row) => row.stockStatus === query.stockStatus);
    }

    rows.sort((a, b) => {
      const direction = query.sortOrder === 'asc' ? 1 : -1;
      switch (query.sortBy) {
        case 'name':
          return a.name.localeCompare(b.name) * direction;
        case 'price':
          return (a.price - b.price) * direction;
        case 'updatedAt':
          return (a.updatedAt.getTime() - b.updatedAt.getTime()) * direction;
        default:
          return (a.stock - b.stock) * direction;
      }
    });

    const start = (query.page - 1) * query.limit;
    return {
      items: rows.slice(start, start + query.limit),
      total: rows.length,
    };
  }

  async summary(): Promise<InventorySummary> {
    const rows = this.products
      .all()
      .filter((product) => product.status !== 'archived')
      .map((product) => this.toRow(product));

    const byCategory = new Map<
      string,
      { categoryId: string; name: string; products: number; units: number; value: number }
    >();

    for (const row of rows) {
      const key = row.categoryId || 'uncategorised';
      const entry = byCategory.get(key) ?? {
        categoryId: key,
        name: row.categoryName ?? 'Uncategorised',
        products: 0,
        units: 0,
        value: 0,
      };
      entry.products += 1;
      entry.units += Math.max(0, row.stock);
      entry.value += Math.max(0, row.stock) * (row.costPrice ?? 0);
      byCategory.set(key, entry);
    }

    return {
      totalProducts: rows.length,
      totalUnits: rows.reduce((sum, row) => sum + Math.max(0, row.stock), 0),
      inStockProducts: rows.filter((row) => row.stockStatus === 'in').length,
      lowStockProducts: rows.filter((row) => row.stockStatus === 'low').length,
      outOfStockProducts: rows.filter((row) => row.stockStatus === 'out').length,
      inventoryValue: rows.reduce(
        (sum, row) => sum + Math.max(0, row.stock) * (row.costPrice ?? 0),
        0,
      ),
      retailValue: rows.reduce(
        (sum, row) => sum + Math.max(0, row.stock) * row.price,
        0,
      ),
      byCategory: [...byCategory.values()].sort((a, b) => b.units - a.units).slice(0, 6),
      topLowStock: rows
        .filter((row) => row.stockStatus === 'low')
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 5)
        .map((row) => ({
          productId: row.productId,
          name: row.name,
          sku: row.sku,
          stock: row.stock,
          lowStockThreshold: row.lowStockThreshold,
        })),
    };
  }

  async findProduct(productId: string): Promise<InventoryProduct | null> {
    const product = await this.products.findById(productId);
    return product ? toInventoryProduct(product) : null;
  }

  async increase(productId: string, quantity: number): Promise<StockMutation | null> {
    const result = this.products.mutateStock(productId, (stock) => stock + quantity);
    return result
      ? { previous: result.before, next: result.product.stock, product: toInventoryProduct(result.product) }
      : null;
  }

  async decrease(
    productId: string,
    quantity: number,
  ): Promise<StockMutation | { insufficient: true; available: number } | null> {
    const result = this.products.mutateStock(productId, (stock) =>
      stock >= quantity ? stock - quantity : null,
    );

    if (result) {
      return {
        previous: result.before,
        next: result.product.stock,
        product: toInventoryProduct(result.product),
      };
    }

    const product = await this.products.findById(productId);
    return product ? { insufficient: true, available: product.stock } : null;
  }

  async setQuantity(productId: string, quantity: number): Promise<StockMutation | null> {
    const result = this.products.mutateStock(productId, () => quantity);
    return result
      ? { previous: result.before, next: quantity, product: toInventoryProduct(result.product) }
      : null;
  }

  async applyDelta(productId: string, delta: number): Promise<void> {
    this.products.mutateStock(productId, (stock) => stock + delta);
  }

  // -------------------------------------------------------------- movements

  async recordMovement(
    input: MovementInput,
  ): Promise<{ movement: MovementRecord; created: boolean }> {
    if (input.referenceId) {
      const existing = this.movements.find(
        (movement) =>
          movement.referenceId === input.referenceId && movement.type === input.type,
      );
      if (existing) {
        return { movement: existing, created: false };
      }
    }

    const movement: MovementRecord = {
      id: newObjectIdLike(),
      productId: input.productId,
      productName: input.productName,
      sku: input.sku,
      type: input.type,
      reason: input.reason,
      notes: input.notes,
      direction: input.direction,
      previousQuantity: input.previousQuantity,
      changedQuantity: input.changedQuantity,
      newQuantity: input.newQuantity,
      performedBy: input.performedBy ?? null,
      referenceId: input.referenceId,
      source: input.source,
      createdAt: new Date(),
    };

    this.movements.unshift(movement);
    return { movement, created: true };
  }

  async findMovement(
    referenceId: string,
    type: MovementType,
  ): Promise<MovementRecord | null> {
    return (
      this.movements.find(
        (movement) => movement.referenceId === referenceId && movement.type === type,
      ) ?? null
    );
  }

  async listMovements(
    query: MovementQuery,
  ): Promise<{ items: MovementRecord[]; total: number }> {
    const search = query.search?.trim().toLowerCase();
    let items = [...this.movements];

    if (query.productId) {
      items = items.filter((movement) => movement.productId === query.productId);
    }
    if (query.type) {
      items = items.filter((movement) => movement.type === query.type);
    }
    if (search) {
      items = items.filter(
        (movement) =>
          movement.productName.toLowerCase().includes(search) ||
          movement.sku.toLowerCase().includes(search) ||
          (movement.referenceId ?? '').toLowerCase().includes(search),
      );
    }
    if (query.from) {
      items = items.filter((movement) => movement.createdAt >= query.from!);
    }
    if (query.to) {
      items = items.filter((movement) => movement.createdAt <= query.to!);
    }

    const start = (query.page - 1) * query.limit;
    return { items: items.slice(start, start + query.limit), total: items.length };
  }

  // ----------------------------------------------------------------- alerts

  async openAlert(input: {
    productId: string;
    productName: string;
    sku: string;
    level: AlertLevel;
    quantity: number;
    lowStockThreshold: number;
  }): Promise<{ alert: AlertRecord; created: boolean }> {
    const key = `${input.productId}:${input.level}`;
    const existing = this.alerts.get(key);

    if (existing) {
      existing.quantity = input.quantity;
      return { alert: { ...existing }, created: false };
    }

    const alert: AlertStore = {
      id: newObjectIdLike(),
      productId: input.productId,
      productName: input.productName,
      sku: input.sku,
      level: input.level,
      status: 'open',
      quantity: input.quantity,
      lowStockThreshold: input.lowStockThreshold,
      createdAt: new Date(),
    };
    this.alerts.set(key, alert);
    return { alert: { ...alert }, created: true };
  }

  async resolveAlerts(productId: string, level?: AlertLevel): Promise<number> {
    let resolved = 0;
    for (const [key, alert] of this.alerts) {
      const matches =
        alert.productId === productId &&
        alert.status === 'open' &&
        (!level || alert.level === level);
      if (matches) {
        alert.status = 'resolved';
        this.alerts.delete(key);
        resolved += 1;
      }
    }
    return resolved;
  }

  async listAlerts(options?: { level?: AlertLevel }): Promise<AlertRecord[]> {
    return [...this.alerts.values()]
      .filter((alert) => alert.status === 'open')
      .filter((alert) => !options?.level || alert.level === options.level)
      .map((alert) => ({ ...alert }));
  }

  // ------------------------------------------------------------------ helpers

  /** Test hook: forgets movements and alerts (paired with a product reset). */
  reset(): void {
    this.movements.length = 0;
    this.alerts.clear();
  }

  /** Convenience for tests: the movements recorded so far, newest first. */
  movementCount(): number {
    return this.movements.length;
  }

  private toRow(product: ProductRecord): InventoryRow {
    const stock = product.stock;
    return {
      productId: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      categoryId: product.categoryId,
      categoryName: this.categoryName(product.categoryId),
      price: product.price,
      costPrice: product.costPrice ?? null,
      stock,
      lowStockThreshold: product.lowStockThreshold,
      stockStatus:
        stock <= 0 ? 'out' : stock <= product.lowStockThreshold ? 'low' : 'in',
      status: product.status,
      imageUrl: product.images[0]?.url ?? null,
      updatedAt: product.updatedAt,
    };
  }
}

function toInventoryProduct(product: ProductRecord): InventoryProduct {
  return {
    productId: product.id,
    name: product.name,
    sku: product.sku,
    stock: product.stock,
    lowStockThreshold: product.lowStockThreshold,
  };
}

function newObjectIdLike(): string {
  return randomBytes(12).toString('hex');
}
