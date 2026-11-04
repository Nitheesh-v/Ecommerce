import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createPaginatedResult } from '../../common/utils/pagination.util.js';
import type { PaginatedResult } from '../../common/utils/pagination.util.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import type { AdjustStockDto } from './dto/adjust-stock.dto.js';
import type { InventoryQueryDto, MovementsQueryDto } from './dto/inventory-query.dto.js';
import { InventoryNotifier } from './inventory.notifier.js';
import {
  InventoryRepository,
  type AlertRecord,
  type InventoryProduct,
  type InventoryRow,
  type InventorySummary,
  type MovementRecord,
  type StockMutation,
  type StockStatus,
} from './repositories/inventory.repository.js';
import type { AlertLevel } from './schemas/inventory-alert.schema.js';
import type { MovementType } from './schemas/inventory-movement.schema.js';

/** The product + resulting state returned by an adjustment. */
export interface AdjustmentResult {
  productId: string;
  productName: string;
  sku: string;
  previousQuantity: number;
  newQuantity: number;
  /** Signed: `+3` for a restock, `-2` for a write-off. */
  changedQuantity: number;
  stockStatus: StockStatus;
  lowStockThreshold: number;
  movement: MovementRecord;
  alert: { level: AlertLevel | null; created: boolean };
}

export interface ReservationResult {
  status: 'reserved' | 'duplicate' | 'insufficient';
  productId: string;
  quantity: number;
  /** Quantity left after the reservation (or currently available when short). */
  available: number;
  movement: MovementRecord | null;
}

export interface RestockResult {
  status: 'restored' | 'duplicate';
  productId: string;
  quantity: number;
  available: number;
  movement: MovementRecord | null;
}

/**
 * Inventory business logic.
 *
 * Ground rules enforced here (and nowhere else):
 *
 * 1. `products.stock` is the only quantity that exists — no shadow inventory.
 * 2. The client sends an **intent** (`increase` / `decrease` / `set`), never the
 *    resulting quantity, and the server re-reads the product while writing it
 *    atomically, so two admins (or an admin and a checkout) cannot lose a write.
 * 3. Stock can never go negative: decrements are guarded in the Mongo filter.
 * 4. Every successful change appends an immutable movement, so the audit trail
 *    explains the number at any point in time.
 * 5. Events that can be replayed (orders, cancellations, refunds) carry a
 *    `referenceId`; a replay is detected and compensated rather than applied twice.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly notifier: InventoryNotifier,
  ) {}

  // ---------------------------------------------------------------- reads

  async list(query: InventoryQueryDto): Promise<PaginatedResult<InventoryRow>> {
    const { items, total } = await this.inventoryRepository.listProducts({
      page: query.page,
      limit: query.limit,
      search: query.search?.trim(),
      categoryId: query.categoryId,
      stockStatus: query.stockStatus,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    return createPaginatedResult(items, query.page, query.limit, total);
  }

  /** Fresh quantity for the adjust modal — never served from a cached client value. */
  async getProductStock(productId: string): Promise<{
    productId: string;
    name: string;
    sku: string;
    quantity: number;
    lowStockThreshold: number;
    stockStatus: StockStatus;
  }> {
    const product = await this.inventoryRepository.findProduct(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return {
      productId: product.productId,
      name: product.name,
      sku: product.sku,
      quantity: product.stock,
      lowStockThreshold: product.lowStockThreshold,
      stockStatus: this.statusOf(product.stock, product.lowStockThreshold),
    };
  }

  async lowStock(query: InventoryQueryDto): Promise<PaginatedResult<InventoryRow>> {
    return this.listWithStatus(query, 'low');
  }

  async outOfStock(query: InventoryQueryDto): Promise<PaginatedResult<InventoryRow>> {
    return this.listWithStatus(query, 'out');
  }

  async summary(): Promise<InventorySummary & { alerts: { low: number; out: number } }> {
    const [summary, alerts] = await Promise.all([
      this.inventoryRepository.summary(),
      this.inventoryRepository.listAlerts(),
    ]);

    return {
      ...summary,
      alerts: {
        low: alerts.filter((alert) => alert.level === 'low').length,
        out: alerts.filter((alert) => alert.level === 'out').length,
      },
    };
  }

  /** Open, deduplicated alerts for the dashboard banner. */
  listAlerts(level?: AlertLevel): Promise<AlertRecord[]> {
    return this.inventoryRepository.listAlerts(level ? { level } : undefined);
  }

  async history(query: MovementsQueryDto): Promise<PaginatedResult<MovementRecord>> {
    const { items, total } = await this.inventoryRepository.listMovements({
      page: query.page,
      limit: query.limit,
      productId: query.productId,
      search: query.search?.trim(),
      type: query.type,
      from: query.from,
      to: query.to,
    });
    return createPaginatedResult(items, query.page, query.limit, total);
  }

  // ------------------------------------------------------------ adjustment

  async adjust(dto: AdjustStockDto, actor: AuthenticatedUser): Promise<AdjustmentResult> {
    this.assertActionQuantity(dto);

    const product = await this.inventoryRepository.findProduct(dto.productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const mutation = await this.applyMutation(product, dto.action, dto.quantity);

    if (mutation.previous === mutation.next) {
      throw new BadRequestException(
        'The new quantity matches the current stock — no adjustment was recorded',
      );
    }

    const committed = await this.commit({
      mutation,
      type: 'adjustment',
      reason: dto.reason,
      notes: dto.notes?.trim(),
      actor,
      referenceId: dto.referenceId?.trim(),
      source: 'admin',
    });

    if (committed.duplicate) {
      throw new ConflictException(
        `This adjustment was already recorded for reference "${dto.referenceId}"`,
      );
    }

    const alert = await this.syncAlerts(mutation, mutation.previous);

    this.logger.log(
      `stock ${dto.action} ${dto.productId} ${mutation.previous} → ${mutation.next} by ${actor.email}`,
    );

    return {
      productId: product.productId,
      productName: product.name,
      sku: product.sku,
      previousQuantity: mutation.previous,
      newQuantity: mutation.next,
      changedQuantity: mutation.next - mutation.previous,
      stockStatus: this.statusOf(mutation.next, product.lowStockThreshold),
      lowStockThreshold: product.lowStockThreshold,
      movement: committed.movement,
      alert,
    };
  }

  /**
   * Records the stock a product was created with.
   *
   * Called by `ProductsService.create()` so the audit trail starts at the same
   * instant as the product, instead of showing a mysterious jump later.
   */
  async registerInitialStock(input: {
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    lowStockThreshold?: number;
    actor?: AuthenticatedUser;
  }): Promise<void> {
    if (input.quantity <= 0) {
      return;
    }

    const { movement } = await this.inventoryRepository.recordMovement({
      productId: input.productId,
      productName: input.productName,
      sku: input.sku,
      type: 'initial',
      reason: 'new_stock',
      direction: 'increase',
      previousQuantity: 0,
      changedQuantity: input.quantity,
      newQuantity: input.quantity,
      performedBy: input.actor
        ? { userId: input.actor.id, email: input.actor.email }
        : null,
      source: 'catalog',
    });

    await this.syncAlerts(
      {
        product: {
          productId: input.productId,
          name: input.productName,
          sku: input.sku,
          stock: input.quantity,
          lowStockThreshold: input.lowStockThreshold ?? 5,
        },
        previous: 0,
        next: input.quantity,
      },
      0,
    );

    this.logger.log(
      `initial stock ${input.quantity} for ${input.sku} (movement ${movement.id})`,
    );
  }

  /**
   * Re-evaluates a product's alerts without changing its quantity.
   * Used when the low-stock threshold is edited (configuration, not stock).
   */
  async refreshAlerts(productId: string): Promise<void> {
    const product = await this.inventoryRepository.findProduct(productId);
    if (!product) {
      return;
    }
    await this.syncAlerts(
      { product, previous: product.stock, next: product.stock },
      product.stock,
    );
  }

  // ------------------------------------------------- order integration hooks

  /**
   * Decrements stock for an order line.
   *
   * Not wired to a route yet (there is no order module), but this is the API the
   * checkout flow must call inside its own transaction:
   *
   * ```ts
   * const result = await inventory.reserveForOrder({
   *   productId, quantity: item.quantity, referenceId: `order:${orderId}`,
   * });
   * if (result.status !== 'reserved') throw new ConflictException('Sold out');
   * ```
   *
   * `referenceId` makes a retried checkout (double-click, network retry, queue
   * redelivery) return `duplicate` instead of taking stock twice.
   */
  async reserveForOrder(input: {
    productId: string;
    quantity: number;
    referenceId: string;
    actor?: AuthenticatedUser | null;
  }): Promise<ReservationResult> {
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      throw new BadRequestException('Order quantity must be a positive integer');
    }

    const existing = await this.inventoryRepository.findMovement(
      input.referenceId,
      'order',
    );
    if (existing) {
      return {
        status: 'duplicate',
        productId: existing.productId,
        quantity: existing.changedQuantity,
        available: existing.newQuantity,
        movement: existing,
      };
    }

    const product = await this.inventoryRepository.findProduct(input.productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const result = await this.inventoryRepository.decrease(input.productId, input.quantity);

    if (result === null) {
      throw new NotFoundException('Product not found');
    }
    if ('insufficient' in result) {
      return {
        status: 'insufficient',
        productId: product.productId,
        quantity: input.quantity,
        available: result.available,
        movement: null,
      };
    }

    const committed = await this.commit({
      mutation: result,
      type: 'order',
      direction: 'decrease',
      notes: `Order ${input.referenceId}`,
      actor: input.actor,
      referenceId: input.referenceId,
      source: 'order',
    });

    await this.syncAlerts(result, result.previous);

    return {
      status: committed.duplicate ? 'duplicate' : 'reserved',
      productId: product.productId,
      quantity: input.quantity,
      available: result.next,
      movement: committed.movement,
    };
  }

  /**
   * Returns stock for an eligible cancellation or a refund/return.
   *
   * `referenceId` must be derived from the source event (e.g.
   * `order:<id>:cancel`, `refund:<id>`), **not** from a timestamp: the pair
   * `(referenceId, type)` is unique, so a cancelled order that receives three
   * webhook deliveries is restocked exactly once.
   */
  async restockForOrder(input: {
    productId: string;
    quantity: number;
    referenceId: string;
    type: Extract<MovementType, 'cancellation' | 'return'>;
    reason?: 'returned' | 'manual_correction';
    actor?: AuthenticatedUser | null;
  }): Promise<RestockResult> {
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      throw new BadRequestException('Restock quantity must be a positive integer');
    }

    const existing = await this.inventoryRepository.findMovement(
      input.referenceId,
      input.type,
    );
    if (existing) {
      return {
        status: 'duplicate',
        productId: existing.productId,
        quantity: existing.changedQuantity,
        available: existing.newQuantity,
        movement: existing,
      };
    }

    const result = await this.inventoryRepository.increase(input.productId, input.quantity);
    if (result === null) {
      throw new NotFoundException('Product not found');
    }

    const committed = await this.commit({
      mutation: result,
      type: input.type,
      reason: input.reason ?? 'returned',
      notes:
        input.type === 'cancellation'
          ? `Order cancelled — ${input.referenceId}`
          : `Return/refund — ${input.referenceId}`,
      actor: input.actor,
      referenceId: input.referenceId,
      source: 'order',
    });

    await this.syncAlerts(result, result.previous);

    return {
      status: committed.duplicate ? 'duplicate' : 'restored',
      productId: result.product.productId,
      quantity: input.quantity,
      available: committed.duplicate ? result.previous : result.next,
      movement: committed.movement,
    };
  }

  /** Single source of truth for the badge shown next to a quantity. */
  statusOf(quantity: number, lowStockThreshold = 5): StockStatus {
    if (quantity <= 0) {
      return 'out';
    }
    return quantity <= lowStockThreshold ? 'low' : 'in';
  }

  // --------------------------------------------------------------- internals

  private async listWithStatus(
    query: InventoryQueryDto,
    stockStatus: StockStatus,
  ): Promise<PaginatedResult<InventoryRow>> {
    return this.list({ ...query, stockStatus });
  }

  private assertActionQuantity(dto: AdjustStockDto): void {
    if (dto.action === 'set' && dto.quantity < 0) {
      throw new BadRequestException('Quantity cannot be negative');
    }
    if (dto.action !== 'set' && dto.quantity < 1) {
      throw new BadRequestException(
        'Quantity to increase or decrease must be at least 1',
      );
    }
  }

  private async applyMutation(
    product: InventoryProduct,
    action: AdjustStockDto['action'],
    quantity: number,
  ): Promise<StockMutation> {
    if (action === 'increase') {
      const result = await this.inventoryRepository.increase(product.productId, quantity);
      if (!result) {
        throw new NotFoundException('Product not found');
      }
      return result;
    }

    if (action === 'decrease') {
      const result = await this.inventoryRepository.decrease(product.productId, quantity);
      if (result === null) {
        throw new NotFoundException('Product not found');
      }
      if ('insufficient' in result) {
        throw new ConflictException(
          `Only ${result.available} unit(s) of ${product.name} are available — stock cannot go negative`,
        );
      }
      return result;
    }

    const result = await this.inventoryRepository.setQuantity(
      product.productId,
      quantity,
    );
    if (!result) {
      throw new NotFoundException('Product not found');
    }
    return result;
  }

  /**
   * Writes the audit row, compensating the stock change when the row turns out to
   * be a duplicate replay (another delivery of the same event already logged it).
   */
  private async commit(input: {
    mutation: StockMutation;
    type: MovementType;
    direction?: 'increase' | 'decrease';
    reason?: AdjustmentResult['movement']['reason'];
    notes?: string;
    actor?: AuthenticatedUser | null;
    referenceId?: string;
    source: string;
  }): Promise<{ movement: MovementRecord; duplicate: boolean }> {
    const { mutation } = input;
    const delta = mutation.next - mutation.previous;

    const { movement, created } = await this.inventoryRepository.recordMovement({
      productId: mutation.product.productId,
      productName: mutation.product.name,
      sku: mutation.product.sku,
      type: input.type,
      reason: input.reason,
      notes: input.notes,
      direction: input.direction ?? (delta >= 0 ? 'increase' : 'decrease'),
      previousQuantity: mutation.previous,
      changedQuantity: delta,
      newQuantity: mutation.next,
      performedBy: input.actor
        ? { userId: input.actor.id, email: input.actor.email }
        : null,
      referenceId: input.referenceId,
      source: input.source,
    });

    if (!created) {
      // The event was already applied: undo our write so stock stays correct.
      await this.inventoryRepository.applyDelta(mutation.product.productId, -delta);
      this.logger.warn(
        `duplicate inventory event ${input.referenceId ?? '(no reference)'} — compensated ${-delta} for ${mutation.product.sku}`,
      );
    }

    return { movement, duplicate: !created };
  }

  /**
   * Keeps `inventory_alerts` in sync with the new quantity.
   *
   * Deduplication: at most one open alert per product per level, enforced by a
   * partial unique index, and the opposite level is resolved first. Repeated
   * updates while already low therefore add no new alert and trigger no
   * notification — only a real state change does.
   */
  private async syncAlerts(
    mutation: StockMutation,
    previousQuantity: number,
  ): Promise<{ level: AlertLevel | null; created: boolean }> {
    const { product } = mutation;
    const level = this.alertLevelOf(mutation.next, product.lowStockThreshold);
    const previousLevel = this.alertLevelOf(previousQuantity, product.lowStockThreshold);

    if (!level) {
      const resolved = await this.inventoryRepository.resolveAlerts(product.productId);
      if (resolved > 0) {
        await this.notifier.alertResolved({
          productId: product.productId,
          productName: product.name,
          sku: product.sku,
          level: previousLevel ?? 'low',
          quantity: mutation.next,
          lowStockThreshold: product.lowStockThreshold,
        });
      }
      return { level: null, created: false };
    }

    // `out` supersedes `low`: close the other level before opening this one.
    await this.inventoryRepository.resolveAlerts(
      product.productId,
      level === 'out' ? 'low' : 'out',
    );

    const { alert, created } = await this.inventoryRepository.openAlert({
      productId: product.productId,
      productName: product.name,
      sku: product.sku,
      level,
      quantity: mutation.next,
      lowStockThreshold: product.lowStockThreshold,
    });

    if (created) {
      await this.notifier.alertOpened(alert);
    }

    return { level, created };
  }

  private alertLevelOf(quantity: number, threshold: number): AlertLevel | null {
    const status = this.statusOf(quantity, threshold);
    return status === 'in' ? null : status;
  }
}
