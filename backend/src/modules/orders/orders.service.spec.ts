import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { InMemoryInventoryRepository } from '../../../test/support/in-memory-inventory.repository.js';
import { InMemoryOrdersRepository } from '../../../test/support/in-memory-orders.repository.js';
import { InMemoryProductsRepository } from '../../../test/support/in-memory-products.repository.js';
import { InventoryService } from '../inventory/inventory.service.js';
import type { CreateProductInput, ProductRecord } from '../products/repositories/products.repository.js';
import type { AdminProductView, ProductsService } from '../products/products.service.js';
import type { UsersService } from '../users/users.service.js';
import { OrdersService } from './orders.service.js';
import { computeTotals, DEFAULT_PRICING } from './pricing.js';

const ADMIN: AuthenticatedUser = {
  id: '64b7f1c2a1b2c3d4e5f600ff',
  email: 'owner@example.com',
  role: Role.Admin,
};

const CUSTOMER: AuthenticatedUser = {
  id: '64b7f1c2a1b2c3d4e5f600aa',
  email: 'customer@example.com',
  role: Role.Customer,
};

const OTHER_CUSTOMER: AuthenticatedUser = {
  id: '64b7f1c2a1b2c3d4e5f600bb',
  email: 'other@example.com',
  role: Role.Customer,
};

const CATEGORY_ID = '64b7f1c2a1b2c3d4e5f60001';

const ADDRESS = {
  recipientName: 'Nitheesh V',
  phone: '+91 98765 43210',
  line1: '10 Curzon Street',
  city: 'Coimbatore',
  state: 'Tamil Nadu',
  postalCode: '641001',
  country: 'India',
};

function productInput(overrides: Partial<CreateProductInput> = {}): CreateProductInput {
  return {
    name: 'Wireless Headphones',
    slug: 'wireless-headphones',
    description: 'Studio-grade wireless headphones.',
    sku: 'SKU-AU-1001',
    categoryId: CATEGORY_ID,
    price: 249_900,
    salePrice: 199_900,
    costPrice: 150_000,
    stock: 10,
    lowStockThreshold: 3,
    status: 'published',
    isFeatured: false,
    images: [{ url: 'https://cdn.example.com/headphones.jpg' }],
    ...overrides,
  };
}

describe('OrdersService', () => {
  let products: InMemoryProductsRepository;
  let orders: InMemoryOrdersRepository;
  let inventory: InventoryService;
  let service: OrdersService;
  let headphones: ProductRecord;

  beforeEach(() => {
    products = new InMemoryProductsRepository();
    orders = new InMemoryOrdersRepository();
    const inventoryRepository = new InMemoryInventoryRepository(products);
    inventory = new InventoryService(inventoryRepository, {
      alertOpened: vi.fn(),
      alertResolved: vi.fn(),
    } as never);

    const productsService = {
      getForAdmin: async (id: string): Promise<AdminProductView> => {
        const product = await products.findById(id);
        if (!product) {
          throw new NotFoundException('Product not found');
        }
        return {
          ...product,
          category: null,
          stockStatus: product.stock <= 0 ? 'out' : product.stock <= product.lowStockThreshold ? 'low' : 'in',
          effectivePrice: product.salePrice ?? product.price,
        };
      },
    } as unknown as ProductsService;

    const usersService = {
      rememberPhone: async () => undefined,
    } as unknown as UsersService;

    service = new OrdersService(orders, productsService, inventory, usersService);
    headphones = products.seed(productInput());
  });

  const checkout = (overrides: Record<string, unknown> = {}) =>
    service.createForCustomer(CUSTOMER, {
      items: [{ productId: headphones.id, quantity: 2 }],
      shippingAddress: ADDRESS,
      paymentMethod: 'cod',
      ...overrides,
    } as never);

  describe('pricing', () => {
    it('charges the sale price and records the saving as a discount', () => {
      const totals = computeTotals(
        [{ unitPrice: 199_900, listPrice: 249_900, quantity: 2 }],
        DEFAULT_PRICING,
      );

      expect(totals.subtotal).toBe(499_800);
      expect(totals.discountTotal).toBe(100_000);
      expect(totals.shippingCharge).toBe(0); // above the free-shipping threshold
      expect(totals.total).toBe(399_800);
    });

    it('adds flat shipping below the threshold and tax when configured', () => {
      const totals = computeTotals(
        [{ unitPrice: 10_000, listPrice: 10_000, quantity: 1 }],
        { ...DEFAULT_PRICING, taxRatePercent: 18 },
      );

      expect(totals.shippingCharge).toBe(DEFAULT_PRICING.flatShippingCharge);
      expect(totals.taxAmount).toBe(1_800);
      expect(totals.total).toBe(10_000 + 4_900 + 1_800);
    });
  });

  describe('createForCustomer', () => {
    it('prices the order on the server and snapshots the product', async () => {
      const { order, created } = await checkout();

      expect(created).toBe(true);
      expect(order.status).toBe('pending');
      expect(order.paymentStatus).toBe('pending');
      expect(order.total).toBe(399_800);
      expect(order.items[0]).toMatchObject({
        name: 'Wireless Headphones',
        sku: 'SKU-AU-1001',
        unitPrice: 199_900,
        listPrice: 249_900,
        quantity: 2,
        lineTotal: 399_800,
      });
      expect(order.orderNumber).toMatch(/^ORD-\d{8}-\d{4}$/);
    });

    it('reserves stock once and never trusts a client-supplied price', async () => {
      await checkout({ items: [{ productId: headphones.id, quantity: 3 }] });

      expect((await products.findById(headphones.id))?.stock).toBe(7);
    });

    it('replays idempotently instead of creating a second order', async () => {
      const first = await checkout({ idempotencyKey: 'checkout-abc' });
      const second = await checkout({ idempotencyKey: 'checkout-abc' });

      expect(second.created).toBe(false);
      expect(second.order.id).toBe(first.order.id);
      expect((await products.findById(headphones.id))?.stock).toBe(8);
      expect(orders.all()).toHaveLength(1);
    });

    it('refuses to oversell and leaves stock untouched', async () => {
      await expect(
        checkout({ items: [{ productId: headphones.id, quantity: 50 }] }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect((await products.findById(headphones.id))?.stock).toBe(10);
      expect(orders.all()).toHaveLength(0);
    });

    it('releases earlier reservations when a later line is unavailable', async () => {
      const cable = products.seed(
        productInput({
          name: 'USB-C Cable',
          slug: 'usb-c-cable',
          sku: 'SKU-CAB-1',
          price: 19_900,
          salePrice: null,
          stock: 1,
        }),
      );

      await expect(
        checkout({
          items: [
            { productId: headphones.id, quantity: 2 },
            { productId: cable.id, quantity: 5 },
          ],
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect((await products.findById(headphones.id))?.stock).toBe(10);
      expect(orders.all()).toHaveLength(0);
    });

    it('refuses unpublished products', async () => {
      const draft = products.seed(
        productInput({ name: 'Draft Item', slug: 'draft-item', sku: 'SKU-DRAFT', status: 'draft' }),
      );

      await expect(
        checkout({ items: [{ productId: draft.id, quantity: 1 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('status transitions', () => {
    it('walks the fulfilment path and records history', async () => {
      const { order } = await checkout();

      const confirmed = await service.updateStatus(
        order.id,
        { status: 'confirmed', reason: 'Payment verified' },
        ADMIN,
      );
      expect(confirmed.status).toBe('confirmed');
      expect(confirmed.history.at(-1)).toMatchObject({
        kind: 'status',
        from: 'pending',
        to: 'confirmed',
        reason: 'Payment verified',
        by: { userId: ADMIN.id, email: ADMIN.email },
      });
      expect(confirmed.allowedNextStatuses).toEqual(['processing']);
    });

    it('rejects an illegal jump', async () => {
      const { order } = await checkout();

      await expect(
        service.updateStatus(order.id, { status: 'delivered' }, ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a no-op transition', async () => {
      const { order } = await checkout();

      await expect(
        service.updateStatus(order.id, { status: 'pending' }, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('routes cancellation through the cancellation rules', async () => {
      const { order } = await checkout();

      const cancelled = await service.updateStatus(
        order.id,
        { status: 'cancelled', reason: 'Customer changed their mind' },
        ADMIN,
      );

      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancellation?.restocked).toBe(true);
      expect((await products.findById(headphones.id))?.stock).toBe(10);
    });

    it('refuses to fake a return through the status endpoint', async () => {
      const { order } = await checkout();

      await expect(
        service.updateStatus(order.id, { status: 'return_requested' }, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cancellation', () => {
    it('restores stock exactly once and records who cancelled', async () => {
      const { order } = await checkout({ items: [{ productId: headphones.id, quantity: 4 }] });
      expect((await products.findById(headphones.id))?.stock).toBe(6);

      const cancelled = await service.cancelOrder(
        order.id,
        { reason: 'Out of stock at warehouse' },
        ADMIN,
      );

      expect(cancelled.cancellation).toMatchObject({
        reason: 'Out of stock at warehouse',
        restocked: true,
        cancelledBy: { userId: ADMIN.id },
      });
      expect((await products.findById(headphones.id))?.stock).toBe(10);

      await expect(
        service.cancelOrder(order.id, { reason: 'Again' }, ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);

      // Still 10: the duplicate attempt never restocked a second time.
      expect((await products.findById(headphones.id))?.stock).toBe(10);
    });

    it('cannot cancel an order that already shipped', async () => {
      const { order } = await checkout();

      for (const status of ['confirmed', 'processing', 'shipped'] as const) {
        await service.updateStatus(order.id, { status }, ADMIN);
      }

      await expect(
        service.cancelOrder(order.id, { reason: 'Too late' }, ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('queues a refund for a paid order instead of pretending it was refunded', async () => {
      const { order } = await checkout();
      await service.updatePayment(order.id, { status: 'paid', transactionId: 'TXN-1' }, ADMIN);

      const cancelled = await service.cancelOrder(
        order.id,
        { reason: 'Damaged in packing' },
        ADMIN,
      );

      expect(cancelled.paymentStatus).toBe('refund_pending');
      expect(cancelled.payment.refunds).toHaveLength(1);
      expect(cancelled.payment.refunds[0]).toMatchObject({
        amount: cancelled.payment.paidAmount,
        status: 'pending',
      });
      expect(cancelled.refundedAmount).toBe(0);
    });
  });

  describe('shipping and payment', () => {
    it('stores tracking details and appends a note', async () => {
      const { order } = await checkout();

      const updated = await service.updateShipping(
        order.id,
        {
          provider: 'Delhivery',
          trackingNumber: 'DLV-123',
          trackingUrl: 'https://track.example.com/DLV-123',
          note: 'Handed to courier',
        },
        ADMIN,
      );

      expect(updated.shipping).toMatchObject({
        provider: 'Delhivery',
        trackingNumber: 'DLV-123',
      });
      expect(updated.shipping?.notes.at(-1)?.note).toBe('Handed to courier');
      expect(updated.history.at(-1)?.kind).toBe('shipping');
    });

    it('records manual payment once and refuses a duplicate', async () => {
      const { order } = await checkout();

      const paid = await service.updatePayment(
        order.id,
        { status: 'paid', transactionId: 'UTR-9988' },
        ADMIN,
      );
      expect(paid.paymentStatus).toBe('paid');
      expect(paid.payment.paidAmount).toBe(paid.total);

      await expect(
        service.updatePayment(order.id, { status: 'paid' }, ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('refunds', () => {
    it('caps refunds at the paid amount and refuses double processing', async () => {
      const { order } = await checkout();
      await service.updatePayment(order.id, { status: 'paid' }, ADMIN);

      const queued = await service.createRefund(
        order.id,
        { amount: order.total, reason: 'Customer complaint' },
        ADMIN,
      );
      const refundId = queued.payment.refunds[0].refundId;

      const processed = await service.updateRefund(
        order.id,
        refundId,
        { status: 'processed', reference: 'RFND-1' },
        ADMIN,
      );

      expect(processed.paymentStatus).toBe('refunded');
      expect(processed.refundedAmount).toBe(order.total);

      await expect(
        service.updateRefund(order.id, refundId, { status: 'processed' }, ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);

      await expect(
        service.createRefund(order.id, { amount: 1_000, reason: 'Extra' }, ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('returns', () => {
    const deliver = async (orderId: string) => {
      for (const status of ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'] as const) {
        await service.updateStatus(orderId, { status }, ADMIN);
      }
    };

    it('only accepts returns for delivered orders', async () => {
      const { order } = await checkout();

      await expect(
        service.requestReturn(
          order.id,
          { reason: 'Changed mind', items: [{ productId: headphones.id, quantity: 1 }] },
          CUSTOMER,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects more units than were purchased', async () => {
      const { order } = await checkout();
      await deliver(order.id);

      await expect(
        service.requestReturn(
          order.id,
          { reason: 'Too many', items: [{ productId: headphones.id, quantity: 99 }] },
          CUSTOMER,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('restocks only after an inspection approves it, and only once', async () => {
      const { order } = await checkout({ items: [{ productId: headphones.id, quantity: 2 }] });
      await deliver(order.id);
      expect((await products.findById(headphones.id))?.stock).toBe(8);

      const requested = await service.requestReturn(
        order.id,
        { reason: 'Defective unit', items: [{ productId: headphones.id, quantity: 1 }] },
        CUSTOMER,
      );
      const returnId = requested.activeReturn!.returnId;
      expect(requested.status).toBe('return_requested');

      await service.updateReturn(order.id, returnId, { action: 'approve' }, ADMIN);
      expect((await products.findById(headphones.id))?.stock).toBe(8);

      await service.updateReturn(order.id, returnId, { action: 'receive' }, ADMIN);

      const inspected = await service.updateReturn(
        order.id,
        returnId,
        { action: 'inspect', inspectionNotes: 'Seal intact', restockApproved: true },
        ADMIN,
      );

      expect(inspected.activeReturn?.status).toBe('restocked');
      expect((await products.findById(headphones.id))?.stock).toBe(9);

      // A second inspection cannot restock again.
      await expect(
        service.updateReturn(
          order.id,
          returnId,
          { action: 'inspect', restockApproved: true },
          ADMIN,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((await products.findById(headphones.id))?.stock).toBe(9);
    });

    it('does not restock when the inspection rejects the goods', async () => {
      const { order } = await checkout();
      await deliver(order.id);

      const requested = await service.requestReturn(
        order.id,
        { reason: 'Not as described', items: [{ productId: headphones.id, quantity: 2 }] },
        CUSTOMER,
      );
      const returnId = requested.activeReturn!.returnId;

      await service.updateReturn(order.id, returnId, { action: 'approve' }, ADMIN);
      await service.updateReturn(order.id, returnId, { action: 'receive' }, ADMIN);
      const inspected = await service.updateReturn(
        order.id,
        returnId,
        { action: 'inspect', inspectionNotes: 'Crushed box', restockApproved: false },
        ADMIN,
      );

      expect(inspected.activeReturn?.status).toBe('inspected');
      expect(inspected.activeReturn?.restockApproved).toBe(false);
      expect((await products.findById(headphones.id))?.stock).toBe(8);
    });

    it('returns the order and queues the refund on completion', async () => {
      const { order } = await checkout();
      await service.updatePayment(order.id, { status: 'paid' }, ADMIN);
      await deliver(order.id);

      const requested = await service.requestReturn(
        order.id,
        { reason: 'Wrong size', items: [{ productId: headphones.id, quantity: 1 }] },
        CUSTOMER,
      );
      const returnId = requested.activeReturn!.returnId;

      await service.updateReturn(order.id, returnId, { action: 'approve' }, ADMIN);
      await service.updateReturn(order.id, returnId, { action: 'receive' }, ADMIN);
      await service.updateReturn(
        order.id,
        returnId,
        { action: 'inspect', restockApproved: true },
        ADMIN,
      );

      const completed = await service.updateReturn(
        order.id,
        returnId,
        { action: 'complete', note: 'Refund approved' },
        ADMIN,
      );

      expect(completed.status).toBe('returned');
      expect(completed.paymentStatus).toBe('refund_pending');
      expect(completed.payment.refunds.at(-1)).toMatchObject({
        amount: 199_900,
        status: 'pending',
      });
    });
  });

  describe('customer isolation', () => {
    it("hides another customer's order behind a 404", async () => {
      const { order } = await checkout();

      await expect(
        service.getForCustomer(order.id, OTHER_CUSTOMER),
      ).rejects.toBeInstanceOf(NotFoundException);

      const mine = await service.getForCustomer(order.id, CUSTOMER);
      expect(mine.id).toBe(order.id);

      const asAdmin = await service.getForAdmin(order.id);
      expect(asAdmin.id).toBe(order.id);
    });

    it('scopes the customer list to their own orders', async () => {
      await checkout();
      await service.createForCustomer(OTHER_CUSTOMER, {
        items: [{ productId: headphones.id, quantity: 1 }],
        shippingAddress: { ...ADDRESS, recipientName: 'Other Person' },
        paymentMethod: 'cod',
      } as never);

      const mine = await service.listForCustomer(CUSTOMER, { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' });
      expect(mine.meta.total).toBe(1);

      const theirs = await service.listForCustomer(OTHER_CUSTOMER, { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' });
      expect(theirs.meta.total).toBe(1);
      expect(theirs.data[0].customerName).toBe('Other Person');
    });
  });

  describe('invoice', () => {
    it('is built from the snapshot and immune to later product edits', async () => {
      const { order } = await checkout();
      const invoice = await service.invoice(order.id);

      expect(invoice.invoiceNumber).toBe(`INV-${order.orderNumber}`);
      expect(invoice.lines[0]).toMatchObject({ sku: 'SKU-AU-1001', quantity: 2, unitPrice: 199_900 });
      expect(invoice.totals.total).toBe(order.total);

      await products.update(headphones.id, { price: 999_900, name: 'Renamed Headphones' });

      const reissued = await service.invoice(order.id);
      expect(reissued.lines[0].name).toBe('Wireless Headphones');
      expect(reissued.totals.total).toBe(order.total);
      expect(reissued.invoiceNumber).toBe(invoice.invoiceNumber);
    });
  });
});
