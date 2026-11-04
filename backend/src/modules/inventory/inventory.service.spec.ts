import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { Role } from '../../common/enums/role.enum.js';
import { InMemoryInventoryRepository } from '../../../test/support/in-memory-inventory.repository.js';
import { InMemoryProductsRepository } from '../../../test/support/in-memory-products.repository.js';
import type { CreateProductInput, ProductRecord } from '../products/repositories/products.repository.js';
import { InventoryNotifier } from './inventory.notifier.js';
import { InventoryService } from './inventory.service.js';

const ACTOR: AuthenticatedUser = {
  id: '64b7f1c2a1b2c3d4e5f600ff',
  email: 'owner@example.com',
  role: Role.Admin,
};

const CATEGORY_ID = '64b7f1c2a1b2c3d4e5f60001';

function productInput(overrides: Partial<CreateProductInput> = {}): CreateProductInput {
  return {
    name: 'Wireless Headphones',
    slug: 'wireless-headphones',
    description: 'Studio-grade wireless headphones.',
    sku: 'SKU-AU-1001',
    categoryId: CATEGORY_ID,
    price: 249_900,
    salePrice: null,
    costPrice: 150_000,
    stock: 12,
    lowStockThreshold: 3,
    status: 'published',
    isFeatured: false,
    images: [],
    ...overrides,
  };
}

describe('InventoryService', () => {
  let products: InMemoryProductsRepository;
  let repository: InMemoryInventoryRepository;
  let notifier: { alertOpened: ReturnType<typeof vi.fn>; alertResolved: ReturnType<typeof vi.fn> };
  let service: InventoryService;
  let product: ProductRecord;

  beforeEach(() => {
    products = new InMemoryProductsRepository();
    repository = new InMemoryInventoryRepository(products, () => 'Audio');
    notifier = { alertOpened: vi.fn(), alertResolved: vi.fn() };
    service = new InventoryService(
      repository,
      notifier as unknown as InventoryNotifier,
    );
    product = products.seed(productInput());
  });

  describe('statusOf', () => {
    it('derives the three states from quantity and threshold', () => {
      expect(service.statusOf(0, 5)).toBe('out');
      expect(service.statusOf(-2, 5)).toBe('out');
      expect(service.statusOf(1, 5)).toBe('low');
      expect(service.statusOf(5, 5)).toBe('low');
      expect(service.statusOf(6, 5)).toBe('in');
    });
  });

  describe('adjust', () => {
    it('increases stock and records a signed movement', async () => {
      const result = await service.adjust(
        {
          productId: product.id,
          action: 'increase',
          quantity: 5,
          reason: 'new_stock',
          notes: 'Restock from supplier',
        },
        ACTOR,
      );

      expect(result.previousQuantity).toBe(12);
      expect(result.newQuantity).toBe(17);
      expect(result.changedQuantity).toBe(5);
      expect(result.stockStatus).toBe('in');
      expect(result.movement).toMatchObject({
        type: 'adjustment',
        direction: 'increase',
        reason: 'new_stock',
        previousQuantity: 12,
        changedQuantity: 5,
        newQuantity: 17,
        performedBy: { userId: ACTOR.id, email: ACTOR.email },
      });

      expect((await products.findById(product.id))?.stock).toBe(17);
    });

    it('decreases stock and records a negative delta', async () => {
      const result = await service.adjust(
        { productId: product.id, action: 'decrease', quantity: 4, reason: 'damaged' },
        ACTOR,
      );

      expect(result.newQuantity).toBe(8);
      expect(result.movement).toMatchObject({
        direction: 'decrease',
        changedQuantity: -4,
        newQuantity: 8,
      });
    });

    it('sets an exact quantity (stock count)', async () => {
      const result = await service.adjust(
        { productId: product.id, action: 'set', quantity: 2, reason: 'manual_correction' },
        ACTOR,
      );

      expect(result.previousQuantity).toBe(12);
      expect(result.newQuantity).toBe(2);
      expect(result.changedQuantity).toBe(-10);
      expect(result.stockStatus).toBe('low');
    });

    it('refuses to drive stock below zero', async () => {
      await expect(
        service.adjust(
          { productId: product.id, action: 'decrease', quantity: 13, reason: 'damaged' },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      // Nothing moved: no stock change, no movement row.
      expect((await products.findById(product.id))?.stock).toBe(12);
      expect(repository.movementCount()).toBe(0);
    });

    it('rejects a zero-quantity increase before touching the product', async () => {
      await expect(
        service.adjust(
          { productId: product.id, action: 'increase', quantity: 0, reason: 'other' },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a no-op "set" instead of writing a meaningless audit row', async () => {
      await expect(
        service.adjust(
          { productId: product.id, action: 'set', quantity: 12, reason: 'manual_correction' },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s for an unknown product', async () => {
      await expect(
        service.adjust(
          {
            productId: '64b7f1c2a1b2c3d4e5f61234',
            action: 'increase',
            quantity: 1,
            reason: 'other',
          },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is idempotent per reference id (a replayed import does not move stock twice)', async () => {
      await service.adjust(
        {
          productId: product.id,
          action: 'increase',
          quantity: 5,
          reason: 'new_stock',
          referenceId: 'import-2026-11-04',
        },
        ACTOR,
      );

      await expect(
        service.adjust(
          {
            productId: product.id,
            action: 'increase',
            quantity: 5,
            reason: 'new_stock',
            referenceId: 'import-2026-11-04',
          },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      // Both the stock and the audit trail were written exactly once.
      expect((await products.findById(product.id))?.stock).toBe(17);
      expect(repository.movementCount()).toBe(1);
    });
  });

  describe('alerts', () => {
    it('opens a low-stock alert and notifies once', async () => {
      await service.adjust(
        { productId: product.id, action: 'set', quantity: 2, reason: 'manual_correction' },
        ACTOR,
      );

      const alerts = await service.listAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({ productId: product.id, level: 'low', quantity: 2 });
      expect(notifier.alertOpened).toHaveBeenCalledTimes(1);
    });

    it('deduplicates repeated updates while the product is already low', async () => {
      await service.adjust(
        { productId: product.id, action: 'set', quantity: 3, reason: 'manual_correction' },
        ACTOR,
      );
      await service.adjust(
        { productId: product.id, action: 'set', quantity: 2, reason: 'manual_correction' },
        ACTOR,
      );
      await service.adjust(
        { productId: product.id, action: 'increase', quantity: 1, reason: 'new_stock' },
        ACTOR,
      );

      expect(await service.listAlerts()).toHaveLength(1);
      // Only the first transition into "low" notified.
      expect(notifier.alertOpened).toHaveBeenCalledTimes(1);
    });

    it('escalates low → out without leaving two open alerts', async () => {
      await service.adjust(
        { productId: product.id, action: 'set', quantity: 3, reason: 'manual_correction' },
        ACTOR,
      );
      const result = await service.adjust(
        { productId: product.id, action: 'set', quantity: 0, reason: 'damaged' },
        ACTOR,
      );

      expect(result.stockStatus).toBe('out');
      expect(result.alert).toEqual({ level: 'out', created: true });

      const alerts = await service.listAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].level).toBe('out');
      expect(notifier.alertOpened).toHaveBeenCalledTimes(2);
    });

    it('resolves the alert once stock is back above the threshold', async () => {
      await service.adjust(
        { productId: product.id, action: 'set', quantity: 0, reason: 'damaged' },
        ACTOR,
      );
      await service.adjust(
        { productId: product.id, action: 'increase', quantity: 10, reason: 'new_stock' },
        ACTOR,
      );

      expect(await service.listAlerts()).toHaveLength(0);
      expect(notifier.alertResolved).toHaveBeenCalledWith(
        expect.objectContaining({ productId: product.id, quantity: 10 }),
      );
    });
  });

  describe('order integration hooks', () => {
    it('reserves stock for an order and is safe to replay', async () => {
      const first = await service.reserveForOrder({
        productId: product.id,
        quantity: 2,
        referenceId: 'order:1001',
      });
      expect(first).toMatchObject({ status: 'reserved', available: 10 });

      // The same event delivered again (retry, queue redelivery) must not
      // decrement a second time.
      const replay = await service.reserveForOrder({
        productId: product.id,
        quantity: 2,
        referenceId: 'order:1001',
      });
      expect(replay.status).toBe('duplicate');
      expect((await products.findById(product.id))?.stock).toBe(10);
      expect(repository.movementCount()).toBe(1);
    });

    it('reports insufficient stock without moving anything', async () => {
      products.mutateStock(product.id, () => 1);

      const result = await service.reserveForOrder({
        productId: product.id,
        quantity: 5,
        referenceId: 'order:1002',
      });

      expect(result).toMatchObject({ status: 'insufficient', available: 1 });
      expect((await products.findById(product.id))?.stock).toBe(1);
      expect(repository.movementCount()).toBe(0);
    });

    it('restores stock for a cancellation exactly once, even if delivered repeatedly', async () => {
      await service.reserveForOrder({
        productId: product.id,
        quantity: 3,
        referenceId: 'order:1003',
      });
      expect((await products.findById(product.id))?.stock).toBe(9);

      const restored = await service.restockForOrder({
        productId: product.id,
        quantity: 3,
        referenceId: 'order:1003:cancel',
        type: 'cancellation',
      });
      expect(restored.status).toBe('restored');
      expect((await products.findById(product.id))?.stock).toBe(12);

      // Three webhook deliveries of the same cancellation → one restore.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const duplicate = await service.restockForOrder({
          productId: product.id,
          quantity: 3,
          referenceId: 'order:1003:cancel',
          type: 'cancellation',
        });
        expect(duplicate.status).toBe('duplicate');
      }

      expect((await products.findById(product.id))?.stock).toBe(12);
    });

    it('treats a refund/return as a separate event from the cancellation', async () => {
      await service.restockForOrder({
        productId: product.id,
        quantity: 2,
        referenceId: 'order:1004:cancel',
        type: 'cancellation',
      });
      await service.restockForOrder({
        productId: product.id,
        quantity: 2,
        referenceId: 'order:1004:refund',
        type: 'return',
      });

      expect((await products.findById(product.id))?.stock).toBe(16);
      expect(repository.movementCount()).toBe(2);
    });

    it('compensates the stock write when the movement turns out to be a replay', async () => {
      // Force the "lost the race" path: the stock write succeeds, but the audit
      // row is rejected as a duplicate → the write must be rolled back.
      await repository.recordMovement({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        type: 'order',
        direction: 'decrease',
        previousQuantity: 12,
        changedQuantity: -2,
        newQuantity: 10,
        referenceId: 'order:1005',
        source: 'order',
      });

      const result = await service.reserveForOrder({
        productId: product.id,
        quantity: 2,
        referenceId: 'order:1005',
      });

      expect(result.status).toBe('duplicate');
      expect((await products.findById(product.id))?.stock).toBe(12);
    });
  });

  describe('registerInitialStock', () => {
    it('logs opening stock as an initial movement', async () => {
      await service.registerInitialStock({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: 12,
        lowStockThreshold: 3,
        actor: ACTOR,
      });

      const history = await service.history({ page: 1, limit: 20 });
      expect(history.data[0]).toMatchObject({
        type: 'initial',
        direction: 'increase',
        previousQuantity: 0,
        newQuantity: 12,
      });
    });

    it('does nothing for a zero opening quantity', async () => {
      await service.registerInitialStock({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: 0,
      });

      expect(repository.movementCount()).toBe(0);
    });
  });

  describe('reads', () => {
    it('summarises units, statuses and value', async () => {
      const lamp = products.seed(productInput({ name: 'Desk Lamp', slug: 'desk-lamp', sku: 'SKU-LMP-1', stock: 0, costPrice: 20_000 }));
      const monitor = products.seed(productInput({ name: 'Monitor', slug: 'monitor', sku: 'SKU-MON-1', stock: 5, lowStockThreshold: 5, costPrice: 100_000 }));

      // Seeding bypasses the service, so bring the alert state up to date first.
      await service.refreshAlerts(lamp.id);
      await service.refreshAlerts(monitor.id);

      const summary = await service.summary();

      expect(summary).toMatchObject({
        totalProducts: 3,
        totalUnits: 17,
        inStockProducts: 1,
        lowStockProducts: 1,
        outOfStockProducts: 1,
      });
      // 12 × 1500 + 5 × 1000 (the out-of-stock product adds nothing)
      expect(summary.inventoryValue).toBe(12 * 150_000 + 5 * 100_000);
      expect(summary.alerts).toEqual({ low: 1, out: 1 });
    });

    it('filters the audit trail by product and type', async () => {
      await service.adjust(
        { productId: product.id, action: 'increase', quantity: 1, reason: 'new_stock' },
        ACTOR,
      );
      await service.reserveForOrder({
        productId: product.id,
        quantity: 1,
        referenceId: 'order:1006',
      });

      const adjustments = await service.history({ page: 1, limit: 20, type: 'adjustment' });
      expect(adjustments.meta.total).toBe(1);
      expect(adjustments.data[0].type).toBe('adjustment');

      const other = await service.history({
        page: 1,
        limit: 20,
        productId: '64b7f1c2a1b2c3d4e5f69999',
      });
      expect(other.meta.total).toBe(0);
    });
  });
});
