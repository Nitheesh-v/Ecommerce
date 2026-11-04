import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createPaginatedResult } from '../../common/utils/pagination.util.js';
import type { PaginatedResult } from '../../common/utils/pagination.util.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { ProductsService } from '../products/products.service.js';
import { UsersService } from '../users/users.service.js';
import type { AdminProductView } from '../products/products.service.js';
import type {
  AdminCreateOrderDto,
  CreateOrderDto,
} from './dto/create-order.dto.js';
import type { OrdersQueryDto } from './dto/orders-query.dto.js';
import type {
  CancelOrderDto,
  CreateRefundDto,
  RequestReturnDto,
  UpdateOrderStatusDto,
  UpdatePaymentDto,
  UpdateRefundDto,
  UpdateReturnDto,
  UpdateShippingDto,
} from './dto/order-actions.dto.js';
import { buildInvoice, resolveStoreProfile } from './invoice.js';
import type { InvoiceView, StoreProfile } from './invoice.js';
import {
  canCancel,
  canRequestReturn,
  canTransition,
  ORDER_STATUS_LABELS,
} from './order-status.js';
import { computeTotals, resolvePricingConfig } from './pricing.js';
import type { PricingConfig } from './pricing.js';
import {
  OrdersRepository,
  type HistoryRecord,
  type OrderActor,
  type OrderRecord,
  type OrderUpdate,
  type RefundRecord,
  type ReturnRecord,
} from './repositories/orders.repository.js';
import type {
  OrderStatus,
  PaymentStatus,
} from './schemas/order.schema.js';

/** An order plus the derived fields the console renders. */
export interface OrderView extends OrderRecord {
  /** Total units, not distinct lines. */
  itemCount: number;
  refundedAmount: number;
  pendingRefundAmount: number;
  /** `total − paid` (never negative). */
  balanceDue: number;
  allowedNextStatuses: OrderStatus[];
  canCancel: boolean;
  canRequestReturn: boolean;
  /** Latest return that is still in flight (if any). */
  activeReturn: ReturnRecord | null;
}

export interface CreateOrderResult {
  order: OrderView;
  /** `false` when an idempotent replay returned an existing order. */
  created: boolean;
}

/**
 * Order business logic.
 *
 * Invariants (each one is covered by a test):
 *
 * 1. **Totals are computed here**, from product records — a client cannot post a
 *    price, a discount or a total.
 * 2. **Snapshots are immutable**: name, SKU, image, unit price and the delivery
 *    address are copied onto the order at creation.
 * 3. **Transitions are validated** by `order-status.ts`; the write is guarded by
 *    the status it was read at, so two operators cannot both transition.
 * 4. **Stock moves exactly once**: reservations use `order:<no>:<productId>`,
 *    cancellations `order:<no>:cancel:<productId>`, return restocks
 *    `order:<no>:return:<returnId>:<productId>` — all idempotent in inventory.
 * 5. **Refunds are records, never assumptions.** Cancelling a paid order creates a
 *    *pending* refund obligation; money only counts as refunded when an admin marks
 *    a refund processed with a reference.
 * 6. **History is append-only** and written in the same atomic update as the change.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly pricing: PricingConfig;
  private readonly store: StoreProfile;

  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly productsService: ProductsService,
    private readonly inventoryService: InventoryService,
    private readonly usersService: UsersService,
  ) {
    this.pricing = resolvePricingConfig();
    this.store = resolveStoreProfile();
  }

  // ------------------------------------------------------------------ reads

  async list(query: OrdersQueryDto): Promise<PaginatedResult<OrderView>> {
    const { items, total } = await this.ordersRepository.list({
      page: query.page,
      limit: query.limit,
      search: query.search?.trim(),
      status: query.status,
      paymentStatus: query.paymentStatus,
      paymentMethod: query.paymentMethod,
      from: query.from,
      to: query.to,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return createPaginatedResult(items.map((order) => this.toView(order)), query.page, query.limit, total);
  }

  async getForAdmin(id: string): Promise<OrderView> {
    return this.toView(await this.requireOrder(id));
  }

  async history(id: string): Promise<HistoryRecord[]> {
    const order = await this.requireOrder(id);
    return [...order.history].sort((a, b) => b.at.getTime() - a.at.getTime());
  }

  async invoice(id: string): Promise<InvoiceView> {
    return buildInvoice(await this.requireOrder(id), this.store);
  }

  // -------------------------------------------------------------- creation

  /**
   * Customer checkout.
   *
   * Identity comes from the JWT, never from the payload, so one account cannot
   * place an order in another customer's name.
   */
  async createForCustomer(
    user: AuthenticatedUser,
    dto: CreateOrderDto,
  ): Promise<CreateOrderResult> {
    return this.createOrder({
      dto,
      customer: {
        userId: user.id,
        // The name the parcel is addressed to is the most reliable label we have
        // until customer profiles ship.
        name: dto.shippingAddress.recipientName.trim(),
        email: user.email,
      },
      actor: { userId: user.id, email: user.email, role: user.role },
    });
  }

  /** Admin-entered order (phone sale, manual entry, fixtures). */
  async createManual(
    actor: AuthenticatedUser,
    dto: AdminCreateOrderDto,
  ): Promise<CreateOrderResult> {
    return this.createOrder({
      dto,
      customer: {
        userId: dto.userId ?? null,
        name: dto.customerName.trim(),
        email: dto.customerEmail.trim().toLowerCase(),
        phone: dto.customerPhone?.trim(),
      },
      actor: { userId: actor.id, email: actor.email, role: actor.role },
    });
  }

  /**
   * Shared creation path.
   *
   * Order of operations matters: stock is reserved **before** the document is
   * written (so a sold-out line never leaves an order behind), and any reservation
   * made in this attempt is released if a later step fails.
   */
  private async createOrder(input: {
    dto: CreateOrderDto;
    customer: { userId: string | null; name: string; email: string; phone?: string };
    actor: OrderActor & { role: Role };
  }): Promise<CreateOrderResult> {
    const { dto, customer, actor } = input;

    // Idempotent replay: return the order that key already created.
    if (dto.idempotencyKey) {
      const existing = await this.ordersRepository.findByIdempotencyKey(dto.idempotencyKey);
      if (existing) {
        return { order: this.toView(existing), created: false };
      }
    }

    const lines = await this.resolveLines(dto.items);
    const totals = computeTotals(
      lines.map((line) => ({
        unitPrice: line.unitPrice,
        listPrice: line.listPrice,
        quantity: line.quantity,
      })),
      this.pricing,
    );

    const orderNumber = await this.ordersRepository.nextOrderNumber();
    const reserved: Array<{ productId: string; quantity: number }> = [];

    try {
      for (const line of lines) {
        const reservation = await this.inventoryService.reserveForOrder({
          productId: line.productId,
          quantity: line.quantity,
          // Includes the product id: inventory keys are unique per event + product.
          referenceId: `order:${orderNumber}:${line.productId}`,
          actor: actor.userId
            ? { id: actor.userId, email: actor.email ?? '', role: actor.role }
            : null,
        });

        if (reservation.status === 'insufficient') {
          throw new ConflictException(
            `Only ${reservation.available} unit(s) of "${line.name}" are available`,
          );
        }

        reserved.push({ productId: line.productId, quantity: line.quantity });
      }

      const history: HistoryRecord[] = [
        {
          kind: 'status',
          to: 'pending',
          note: 'Order placed',
          by: actor,
          at: new Date(),
        },
      ];

      if (dto.customerNote?.trim()) {
        history.push({
          kind: 'note',
          note: dto.customerNote.trim(),
          by: actor,
          at: new Date(),
        });
      }

      const created = await this.ordersRepository.create({
        orderNumber,
        userId: customer.userId,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone ?? dto.shippingAddress.phone,
        items: lines.map((line) => ({
          productId: line.productId,
          name: line.name,
          sku: line.sku,
          imageUrl: line.imageUrl,
          unitPrice: line.unitPrice,
          listPrice: line.listPrice,
          discount: (line.listPrice - line.unitPrice) * line.quantity,
          quantity: line.quantity,
          lineTotal: line.unitPrice * line.quantity,
        })),
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        couponDiscount: totals.couponDiscount,
        shippingCharge: totals.shippingCharge,
        taxAmount: totals.taxAmount,
        taxRatePercent: totals.taxRatePercent,
        total: totals.total,
        currency: this.pricing.currency,
        shippingAddress: {
          recipientName: dto.shippingAddress.recipientName.trim(),
          phone: dto.shippingAddress.phone.trim(),
          line1: dto.shippingAddress.line1.trim(),
          line2: dto.shippingAddress.line2?.trim(),
          city: dto.shippingAddress.city.trim(),
          state: dto.shippingAddress.state.trim(),
          postalCode: dto.shippingAddress.postalCode.trim(),
          country: dto.shippingAddress.country?.trim() || 'India',
        },
        shippingMethod: dto.shippingMethod ?? 'standard',
        payment: { method: dto.paymentMethod, paidAmount: 0 },
        // Never 'paid': only an admin action or a verified webhook can set that.
        paymentStatus: 'pending',
        status: 'pending',
        history,
        idempotencyKey: dto.idempotencyKey?.trim(),
      });

      if (!created) {
        // Lost the idempotency race: release what this attempt reserved.
        await this.releaseReservations(orderNumber, reserved);
        const existing = dto.idempotencyKey
          ? await this.ordersRepository.findByIdempotencyKey(dto.idempotencyKey)
          : null;

        if (existing) {
          return { order: this.toView(existing), created: false };
        }

        throw new ConflictException('This order was already created — reload to see it');
      }

      this.logger.log(`order ${created.orderNumber} placed (${created.items.length} lines)`);

      // Learn the contact number the customer used at checkout. Best-effort: a
      // profile nicety must never fail a placed order.
      if (customer.userId) {
        try {
          await this.usersService.rememberPhone(customer.userId, dto.shippingAddress.phone);
        } catch (error) {
          this.logger.warn(
            `Could not store phone for user ${customer.userId}: ${String(error)}`,
          );
        }
      }

      return { order: this.toView(created), created: true };
    } catch (error) {
      // Anything above that failed after a reservation was made must not leak stock.
      await this.releaseReservations(orderNumber, reserved);
      throw error;
    }
  }

  // ------------------------------------------------------------ transitions

  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    actor: AuthenticatedUser,
  ): Promise<OrderView> {
    const order = await this.requireOrder(id);

    if (dto.status === order.status) {
      throw new BadRequestException(
        `The order is already ${ORDER_STATUS_LABELS[order.status].toLowerCase()}`,
      );
    }

    // Cancellation and returns have their own flows (stock + money rules); the
    // generic transition endpoint must not bypass them.
    if (dto.status === 'cancelled') {
      return this.cancelOrder(
        id,
        { reason: dto.reason?.trim() || 'Cancelled by admin', note: dto.note },
        actor,
      );
    }
    if (dto.status === 'return_requested' || dto.status === 'returned') {
      throw new BadRequestException(
        'Returns are handled by the return workflow, not by a status change',
      );
    }

    if (!canTransition(order.status, dto.status)) {
      throw new ConflictException(
        `Cannot move an order from ${ORDER_STATUS_LABELS[order.status]} to ${ORDER_STATUS_LABELS[dto.status]}`,
      );
    }

    const now = new Date();
    const set: Record<string, unknown> = { status: dto.status };

    // Keep delivery timestamps in step with the status, so the customer-facing
    // tracking block is never blank after shipping.
    if (dto.status === 'shipped') {
      set['shipping.shippedAt'] = order.shipping?.shippedAt ?? now;
    }
    if (dto.status === 'delivered') {
      set['shipping.deliveredAt'] = now;
    }

    const updated = await this.applyOrConflict(
      id,
      { status: [order.status] },
      {
        set,
        pushHistory: [
          {
            kind: 'status',
            from: order.status,
            to: dto.status,
            reason: dto.reason?.trim(),
            note: dto.note?.trim(),
            by: { userId: actor.id, email: actor.email },
            at: now,
          },
        ],
      },
    );

    return this.toView(updated);
  }

  // ----------------------------------------------------------- cancellation

  /**
   * Cancels an order and returns its stock **once**.
   *
   * A paid order is moved to `refund_pending` with a *pending* refund record — the
   * money has not moved yet, and pretending otherwise is exactly the failure mode
   * the brief warns about.
   */
  async cancelOrder(
    id: string,
    dto: CancelOrderDto,
    actor: AuthenticatedUser,
  ): Promise<OrderView> {
    const order = await this.requireOrder(id);

    if (order.status === 'cancelled') {
      throw new ConflictException('This order has already been cancelled');
    }
    if (!canCancel(order.status)) {
      throw new ConflictException(
        `A ${ORDER_STATUS_LABELS[order.status].toLowerCase()} order cannot be cancelled${
          order.status === 'shipped' || order.status === 'out_for_delivery'
            ? ' — it is already in transit. Use the return workflow after delivery.'
            : ''
        }`,
      );
    }

    const now = new Date();
    const actorRef: OrderActor = { userId: actor.id, email: actor.email };
    const owesRefund = order.payment.paidAmount > 0;
    const refunds = [...order.payment.refunds];

    if (owesRefund && this.refundableRemaining(order) > 0) {
      refunds.push({
        refundId: randomUUID(),
        amount: this.refundableRemaining(order),
        status: 'pending',
        reason: `Order cancelled — ${dto.reason.trim()}`,
        requestedAt: now,
        requestedBy: actorRef,
      });
    }

    const updated = await this.applyOrConflict(
      id,
      { status: [order.status] },
      {
        set: {
          status: 'cancelled',
          closedAt: now,
          cancellation: {
            reason: dto.reason.trim(),
            note: dto.note?.trim(),
            cancelledAt: now,
            cancelledBy: actorRef,
            restocked: false,
          },
          ...(refunds.length > order.payment.refunds.length
            ? {
                payment: { ...order.payment, refunds },
                paymentStatus: 'refund_pending' as PaymentStatus,
              }
            : {}),
        },
        pushHistory: [
          {
            kind: 'status',
            from: order.status,
            to: 'cancelled',
            reason: dto.reason.trim(),
            note: dto.note?.trim(),
            by: actorRef,
            at: now,
          },
          {
            kind: 'cancellation',
            reason: dto.reason.trim(),
            note: 'Stock release started',
            by: actorRef,
            at: now,
          },
          ...(refunds.length > order.payment.refunds.length
            ? [
                {
                  kind: 'refund' as const,
                  note: `Refund obligation recorded for ${this.formatMoney(refunds.at(-1)!.amount)} — awaiting processing`,
                  by: actorRef,
                  at: now,
                },
              ]
            : []),
        ],
      },
    );

    return this.toView(await this.restockCancelledOrder(updated, actor));
  }

  /** Puts every line back on the shelf, guarded by inventory's idempotency keys. */
  private async restockCancelledOrder(
    order: OrderRecord,
    actor: AuthenticatedUser,
  ): Promise<OrderRecord> {
    if (order.cancellation?.restocked) {
      return order;
    }

    const allRestocked = await this.restockItems(order, 'cancel', actor);

    if (allRestocked === 0) {
      return order;
    }

    const now = new Date();
    const updated = await this.ordersRepository.apply(
      order.id,
      { status: ['cancelled'] },
      {
        set: {
          cancellation: {
            ...order.cancellation!,
            restocked: true,
            restockedAt: now,
          },
        },
        pushHistory: [
          {
            kind: 'cancellation',
            note: `${allRestocked} line(s) returned to stock`,
            by: { userId: actor.id, email: actor.email },
            at: now,
          },
        ],
      },
    );

    return updated ?? order;
  }

  // --------------------------------------------------------------- shipping

  async updateShipping(
    id: string,
    dto: UpdateShippingDto,
    actor: AuthenticatedUser,
  ): Promise<OrderView> {
    const order = await this.requireOrder(id);

    if (order.status === 'cancelled' || order.status === 'returned') {
      throw new ConflictException(
        `Shipping cannot change on a ${ORDER_STATUS_LABELS[order.status].toLowerCase()} order`,
      );
    }

    const now = new Date();
    const shipping = {
      ...(order.shipping ?? { notes: [] }),
      ...(dto.provider !== undefined ? { provider: dto.provider.trim() } : {}),
      ...(dto.trackingNumber !== undefined
        ? { trackingNumber: dto.trackingNumber.trim() }
        : {}),
      ...(dto.trackingUrl !== undefined ? { trackingUrl: dto.trackingUrl.trim() } : {}),
      ...(dto.shippedAt !== undefined ? { shippedAt: dto.shippedAt } : {}),
      ...(dto.estimatedDelivery !== undefined
        ? { estimatedDelivery: dto.estimatedDelivery }
        : {}),
      notes: [
        ...(order.shipping?.notes ?? []),
        ...(dto.note?.trim()
          ? [{ note: dto.note.trim(), at: now, by: actor.email }]
          : []),
      ],
    };

    const updated = await this.applyOrConflict(
      id,
      {},
      {
        set: { shipping },
        pushHistory: [
          {
            kind: 'shipping',
            note: describeShippingChange(dto),
            by: { userId: actor.id, email: actor.email },
            at: now,
          },
        ],
      },
    );

    return this.toView(updated);
  }

  // ---------------------------------------------------------------- payment

  /** Manual payment recording (bank transfer confirmed, COD collected). */
  async updatePayment(
    id: string,
    dto: UpdatePaymentDto,
    actor: AuthenticatedUser,
  ): Promise<OrderView> {
    const order = await this.requireOrder(id);

    if (order.paymentStatus === 'refunded' || order.paymentStatus === 'partially_refunded') {
      throw new ConflictException('This payment is in a refund flow and cannot change');
    }
    if (dto.status === 'paid' && order.paymentStatus === 'paid') {
      throw new ConflictException('This order is already marked as paid');
    }
    if (dto.status === 'failed' && order.paymentStatus === 'paid') {
      throw new ConflictException('A paid order cannot be marked as failed');
    }

    const now = new Date();
    const payment =
      dto.status === 'paid'
        ? {
            ...order.payment,
            paidAmount: order.total,
            paidAt: now,
            transactionId: dto.transactionId?.trim() || order.payment.transactionId,
          }
        : { ...order.payment };

    const updated = await this.applyOrConflict(
      id,
      {},
      {
        set: {
          payment,
          paymentStatus: dto.status === 'paid' ? 'paid' : 'failed',
        },
        pushHistory: [
          {
            kind: 'payment',
            from: order.paymentStatus,
            to: dto.status === 'paid' ? 'paid' : 'failed',
            note:
              dto.note?.trim() ||
              (dto.status === 'paid'
                ? `Payment recorded manually${dto.transactionId ? ` (${dto.transactionId})` : ''}`
                : 'Payment marked as failed'),
            by: { userId: actor.id, email: actor.email },
            at: now,
          },
        ],
      },
    );

    return this.toView(updated);
  }

  // ---------------------------------------------------------------- refunds

  /**
   * Records a refund **obligation**. It stays `pending` until an admin confirms
   * the money actually moved (`updateRefund`), and the sum of all refunds can
   * never exceed what the customer paid.
   */
  async createRefund(
    id: string,
    dto: CreateRefundDto,
    actor: AuthenticatedUser,
  ): Promise<OrderView> {
    const order = await this.requireOrder(id);

    if (order.payment.paidAmount <= 0) {
      throw new BadRequestException('Nothing has been paid on this order, so there is nothing to refund');
    }

    const remaining = this.refundableRemaining(order);

    if (remaining <= 0) {
      throw new ConflictException('The full paid amount has already been refunded or is queued');
    }
    if (dto.amount > remaining) {
      throw new BadRequestException(
        `Refund exceeds the refundable amount (${this.formatMoney(remaining)} remaining)`,
      );
    }

    const refund: RefundRecord = {
      refundId: randomUUID(),
      amount: dto.amount,
      status: 'pending',
      reason: dto.reason.trim(),
      requestedAt: new Date(),
      requestedBy: { userId: actor.id, email: actor.email },
    };

    const refunds = [...order.payment.refunds, refund];

    const updated = await this.applyOrConflict(
      id,
      {},
      {
        set: {
          payment: { ...order.payment, refunds },
          paymentStatus: this.paymentStatusFrom(order.payment.paidAmount, refunds),
        },
        pushHistory: [
          {
            kind: 'refund',
            note: `Refund of ${this.formatMoney(refund.amount)} requested — ${refund.reason}`,
            by: { userId: actor.id, email: actor.email },
            at: refund.requestedAt,
          },
        ],
      },
    );

    return this.toView(updated);
  }

  /**
   * Marks a pending refund processed or failed.
   *
   * Re-processing an already-finalised refund is a 409, which is what prevents a
   * double click (or a retried integration call) from issuing money twice.
   */
  async updateRefund(
    id: string,
    refundId: string,
    dto: UpdateRefundDto,
    actor: AuthenticatedUser,
  ): Promise<OrderView> {
    const order = await this.requireOrder(id);
    const refund = order.payment.refunds.find((entry) => entry.refundId === refundId);

    if (!refund) {
      throw new NotFoundException('Refund not found on this order');
    }
    if (refund.status !== 'pending') {
      throw new ConflictException(`This refund is already ${refund.status}`);
    }

    const now = new Date();
    const refunds = order.payment.refunds.map((entry) =>
      entry.refundId === refundId
        ? {
            ...entry,
            status: dto.status,
            reference: dto.reference?.trim() || entry.reference,
            note: dto.note?.trim() || entry.note,
            processedAt: now,
            processedBy: { userId: actor.id, email: actor.email },
          }
        : entry,
    );

    const updated = await this.applyOrConflict(
      id,
      {},
      {
        set: {
          payment: { ...order.payment, refunds },
          paymentStatus: this.paymentStatusFrom(order.payment.paidAmount, refunds),
        },
        pushHistory: [
          {
            kind: 'refund',
            note:
              dto.status === 'processed'
                ? `Refund of ${this.formatMoney(refund.amount)} processed${dto.reference ? ` (${dto.reference})` : ''}`
                : `Refund of ${this.formatMoney(refund.amount)} marked failed`,
            by: { userId: actor.id, email: actor.email },
            at: now,
          },
        ],
      },
    );

    return this.toView(updated);
  }

  // ---------------------------------------------------------------- returns

  /** Customer-initiated return request (also usable by an admin on their behalf). */
  async requestReturn(
    id: string,
    dto: RequestReturnDto,
    user: AuthenticatedUser,
  ): Promise<OrderView> {
    const order = await this.requireOrder(id);
    this.assertCanAccess(order, user);

    if (!canRequestReturn(order.status)) {
      throw new ConflictException(
        `A return can only be requested for a delivered order (this one is ${ORDER_STATUS_LABELS[order.status].toLowerCase()})`,
      );
    }
    if (order.returns.some((entry) => entry.status !== 'rejected')) {
      throw new ConflictException('A return is already in progress for this order');
    }

    const items = dto.items.map((requested) => {
      const line = order.items.find((item) => item.productId === requested.productId);

      if (!line) {
        throw new BadRequestException(
          `Product ${requested.productId} is not part of this order`,
        );
      }
      if (requested.quantity > line.quantity) {
        throw new BadRequestException(
          `Cannot return ${requested.quantity} × "${line.name}" — only ${line.quantity} were purchased`,
        );
      }

      return {
        productId: line.productId,
        name: line.name,
        sku: line.sku,
        quantity: requested.quantity,
        unitPrice: line.unitPrice,
      };
    });

    const now = new Date();
    const returnEntry: ReturnRecord = {
      returnId: randomUUID(),
      status: 'requested',
      reason: dto.reason.trim(),
      note: dto.note?.trim(),
      items,
      refundableAmount: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      restockApproved: false,
      requestedAt: now,
      requestedBy: { userId: user.id, email: user.email },
    };

    const updated = await this.applyOrConflict(
      id,
      { status: ['delivered'] },
      {
        pushReturn: returnEntry,
        set: { status: 'return_requested' },
        pushHistory: [
          {
            kind: 'return',
            from: 'delivered',
            to: 'return_requested',
            reason: dto.reason.trim(),
            note: `Return ${returnEntry.returnId} requested for ${items.length} line(s)`,
            by: { userId: user.id, email: user.email },
            at: now,
          },
        ],
      },
    );

    return this.toView(updated);
  }

  /**
   * Admin return workflow.
   *
   * `approve → receive → inspect(restockApproved) → complete`. Stock is restored
   * only at `inspect` with `restockApproved: true`, and only once.
   */
  async updateReturn(
    id: string,
    returnId: string,
    dto: UpdateReturnDto,
    actor: AuthenticatedUser,
  ): Promise<OrderView> {
    let order = await this.requireOrder(id);
    const returnEntry = order.returns.find((entry) => entry.returnId === returnId);

    if (!returnEntry) {
      throw new NotFoundException('Return not found on this order');
    }

    const now = new Date();
    const actorRef: OrderActor = { userId: actor.id, email: actor.email };
    const next: ReturnRecord = { ...returnEntry };
    const history: HistoryRecord[] = [];
    let orderStatus: OrderStatus | undefined;
    let paymentPatch: { paymentStatus: PaymentStatus; refunds: RefundRecord[] } | undefined;

    switch (dto.action) {
      case 'approve': {
        this.assertReturnStatus(returnEntry, ['requested'], dto.action);
        next.status = 'approved';
        next.decidedAt = now;
        next.decidedBy = actorRef;
        next.decisionNote = dto.note?.trim();
        break;
      }
      case 'reject': {
        this.assertReturnStatus(returnEntry, ['requested', 'approved'], dto.action);
        next.status = 'rejected';
        next.decidedAt = now;
        next.decidedBy = actorRef;
        next.decisionNote = dto.note?.trim();
        // The order goes back to what it really is: delivered.
        orderStatus = 'delivered';
        break;
      }
      case 'receive': {
        this.assertReturnStatus(returnEntry, ['approved'], dto.action);
        next.status = 'received';
        break;
      }
      case 'inspect': {
        this.assertReturnStatus(returnEntry, ['received', 'approved'], dto.action);
        next.status = 'inspected';
        next.inspectionNotes = dto.inspectionNotes?.trim();
        next.inspectionPassed = dto.restockApproved ?? false;
        next.restockApproved = dto.restockApproved ?? false;
        break;
      }
      case 'complete': {
        this.assertReturnStatus(returnEntry, ['restocked', 'inspected'], dto.action);
        orderStatus = 'returned';

        if (order.payment.paidAmount > 0 && next.refundableAmount > 0) {
          const remaining = this.refundableRemaining(order);
          const amount = Math.min(remaining, next.refundableAmount);

          if (amount > 0) {
            const refund: RefundRecord = {
              refundId: randomUUID(),
              amount,
              status: 'pending',
              reason: `Return ${returnId} — ${returnEntry.reason}`,
              requestedAt: now,
              requestedBy: actorRef,
            };
            const refunds = [...order.payment.refunds, refund];

            next.refundId = refund.refundId;
            paymentPatch = {
              paymentStatus: this.paymentStatusFrom(order.payment.paidAmount, refunds),
              refunds,
            };
            history.push({
              kind: 'refund',
              note: `Refund of ${this.formatMoney(amount)} queued for return ${returnId}`,
              by: actorRef,
              at: now,
            });
          }
        }
        break;
      }
    }

    const updated = await this.applyOrConflict(
      id,
      { returnId },
      {
        set: {
          returns: order.returns.map((entry) =>
            entry.returnId === returnId ? next : entry,
          ),
          ...(orderStatus ? { status: orderStatus } : {}),
          ...(orderStatus === 'returned' ? { closedAt: now } : {}),
          ...(paymentPatch
            ? {
                payment: { ...order.payment, refunds: paymentPatch.refunds },
                paymentStatus: paymentPatch.paymentStatus,
              }
            : {}),
        },
        pushHistory: [
          {
            kind: 'return',
            from: returnEntry.status,
            to: next.status,
            note: dto.note?.trim() || `Return ${dto.action}`,
            by: actorRef,
            at: now,
          },
          ...history,
        ],
      },
    );

    // Restock **after** the inspection is persisted, and only when approved.
    if (
      dto.action === 'inspect' &&
      next.restockApproved &&
      updated.returns.find((entry) => entry.returnId === returnId)?.status === 'inspected'
    ) {
      const restocked = await this.restockReturnItems(updated, returnId, actor);
      order = { ...updated };

      if (restocked > 0) {
        order = await this.applyOrConflict(
          id,
          { returnId },
          {
            set: {
              returns: order.returns.map((entry) =>
                entry.returnId === returnId
                  ? { ...entry, status: 'restocked', restockedAt: new Date() }
                  : entry,
              ),
            },
            pushHistory: [
              {
                kind: 'return',
                from: 'inspected',
                to: 'restocked',
                note: `${restocked} line(s) returned to stock after inspection`,
                by: actorRef,
                at: new Date(),
              },
            ],
          },
        );
      }

      return this.toView(order);
    }

    return this.toView(updated);
  }

  // --------------------------------------------------------- customer reads

  /**
   * Order history for **one** customer, used by the admin customer profile.
   *
   * Scoping is explicit (never derived from a query parameter the client could
   * change) and the caller is responsible for having verified that the id is an
   * existing customer.
   */
  async listForUser(
    userId: string,
    query: OrdersQueryDto,
  ): Promise<PaginatedResult<OrderView>> {
    const { items, total } = await this.ordersRepository.list({
      page: query.page,
      limit: query.limit,
      userId,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return createPaginatedResult(
      items.map((order) => this.toView(order)),
      query.page,
      query.limit,
      total,
    );
  }

  async listForCustomer(
    user: AuthenticatedUser,
    query: OrdersQueryDto,
  ): Promise<PaginatedResult<OrderView>> {
    const { items, total } = await this.ordersRepository.list({
      page: query.page,
      limit: query.limit,
      search: query.search?.trim(),
      status: query.status,
      paymentStatus: query.paymentStatus,
      paymentMethod: query.paymentMethod,
      from: query.from,
      to: query.to,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      // Hard scope: a customer query can only ever see their own rows.
      userId: user.id,
    });

    return createPaginatedResult(items.map((order) => this.toView(order)), query.page, query.limit, total);
  }

  async getForCustomer(id: string, user: AuthenticatedUser): Promise<OrderView> {
    const order = await this.requireOrder(id);
    this.assertCanAccess(order, user);

    return this.toView(order);
  }

  async invoiceForCustomer(id: string, user: AuthenticatedUser): Promise<InvoiceView> {
    const order = await this.requireOrder(id);
    this.assertCanAccess(order, user);

    return buildInvoice(order, this.store);
  }

  // --------------------------------------------------------------- internals

  /**
   * Ownership check.
   *
   * A mismatch answers **404, not 403** — an attacker must not be able to probe
   * which order ids exist.
   */
  private assertCanAccess(order: OrderRecord, user: AuthenticatedUser): void {
    if (user.role === Role.Admin) {
      return;
    }

    const ownsById = order.userId !== null && order.userId === user.id;
    const ownsByEmail = order.customerEmail === user.email.toLowerCase();

    if (!ownsById && !ownsByEmail) {
      throw new NotFoundException('Order not found');
    }

    if (!ownsById && order.userId !== null) {
      // Same email but a different account (e.g. account re-created): refuse.
      throw new ForbiddenException('This order belongs to another account');
    }
  }

  private async requireOrder(id: string): Promise<OrderRecord> {
    const order = await this.ordersRepository.findById(id);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  /**
   * Applies an update and converts a failed optimistic guard into a 409.
   * The guard is what makes concurrent admin actions safe.
   */
  private async applyOrConflict(
    id: string,
    guard: Parameters<OrdersRepository['apply']>[1],
    update: OrderUpdate,
  ): Promise<OrderRecord> {
    const updated = await this.ordersRepository.apply(id, guard, update);

    if (!updated) {
      throw new ConflictException(
        'This order changed while you were editing it — reload and try again',
      );
    }

    return updated;
  }

  /** Reads products and builds priced lines; refuses unavailable items. */
  private async resolveLines(items: Array<{ productId: string; quantity: number }>) {
    const products: AdminProductView[] = [];

    for (const item of items) {
      let product: AdminProductView;

      try {
        product = await this.productsService.getForAdmin(item.productId);
      } catch {
        throw new BadRequestException(`Product ${item.productId} does not exist`);
      }

      if (product.status !== 'published') {
        throw new BadRequestException(`"${product.name}" is not available for purchase`);
      }
      if (product.stock < item.quantity) {
        throw new ConflictException(
          `Only ${product.stock} unit(s) of "${product.name}" are available`,
        );
      }

      products.push(product);
    }

    return products.map((product, index) => ({
      productId: String(product.id),
      name: product.name,
      sku: product.sku,
      imageUrl: product.images[0]?.url ?? null,
      // Charged price and list price both come from the product record.
      unitPrice: product.effectivePrice,
      listPrice: product.price,
      quantity: items[index].quantity,
    }));
  }

  /** Best-effort compensation for a failed checkout attempt. */
  private async releaseReservations(
    orderNumber: string,
    reserved: Array<{ productId: string; quantity: number }>,
  ): Promise<void> {
    for (const line of reserved) {
      try {
        await this.inventoryService.restockForOrder({
          productId: line.productId,
          quantity: line.quantity,
          referenceId: `order:${orderNumber}:rollback:${line.productId}`,
          type: 'cancellation',
          reason: 'manual_correction',
        });
      } catch (error) {
        this.logger.error(
          `Could not release reservation for ${line.productId} on ${orderNumber}: ${String(error)}`,
        );
      }
    }
  }

  /** @returns how many lines were actually restored (0 when already done). */
  private async restockItems(
    order: OrderRecord,
    scope: 'cancel',
    actor: AuthenticatedUser,
  ): Promise<number> {
    let restored = 0;

    for (const item of order.items) {
      try {
        const result = await this.inventoryService.restockForOrder({
          productId: item.productId,
          quantity: item.quantity,
          referenceId: `order:${order.orderNumber}:${scope}:${item.productId}`,
          type: 'cancellation',
          actor,
        });

        if (result.status === 'restored') {
          restored += 1;
        }
      } catch (error) {
        this.logger.error(
          `Restock failed for ${item.sku} on ${order.orderNumber}: ${String(error)}`,
        );
      }
    }

    return restored;
  }

  /** @returns how many lines were actually restored (0 when already done). */
  private async restockReturnItems(
    order: OrderRecord,
    returnId: string,
    actor: AuthenticatedUser,
  ): Promise<number> {
    const entry = order.returns.find((candidate) => candidate.returnId === returnId);

    if (!entry) {
      return 0;
    }

    let restored = 0;

    for (const item of entry.items) {
      try {
        const result = await this.inventoryService.restockForOrder({
          productId: item.productId,
          quantity: item.quantity,
          referenceId: `order:${order.orderNumber}:return:${returnId}:${item.productId}`,
          type: 'return',
          actor,
        });

        if (result.status === 'restored') {
          restored += 1;
        }
      } catch (error) {
        this.logger.error(
          `Return restock failed for ${item.sku} on ${order.orderNumber}: ${String(error)}`,
        );
      }
    }

    return restored;
  }

  private assertReturnStatus(
    entry: ReturnRecord,
    allowed: ReturnRecord['status'][],
    action: string,
  ): void {
    if (!allowed.includes(entry.status)) {
      throw new ConflictException(
        `Cannot ${action} a return that is ${entry.status.replace(/_/g, ' ')}`,
      );
    }
  }

  private refundableRemaining(order: OrderRecord): number {
    const committed = order.payment.refunds
      .filter((refund) => refund.status !== 'failed')
      .reduce((sum, refund) => sum + refund.amount, 0);

    return Math.max(0, order.payment.paidAmount - committed);
  }

  private paymentStatusFrom(paidAmount: number, refunds: RefundRecord[]): PaymentStatus {
    if (paidAmount <= 0) {
      return 'pending';
    }

    const processed = refunds
      .filter((refund) => refund.status === 'processed')
      .reduce((sum, refund) => sum + refund.amount, 0);
    const pending = refunds
      .filter((refund) => refund.status === 'pending')
      .reduce((sum, refund) => sum + refund.amount, 0);

    if (processed >= paidAmount) {
      return 'refunded';
    }
    if (processed > 0) {
      return 'partially_refunded';
    }
    if (pending > 0) {
      return 'refund_pending';
    }

    return 'paid';
  }

  private formatMoney(minorUnits: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: this.pricing.currency,
      maximumFractionDigits: 0,
    }).format(minorUnits / 100);
  }

  private toView(order: OrderRecord): OrderView {
    const refundedAmount = order.payment.refunds
      .filter((refund) => refund.status === 'processed')
      .reduce((sum, refund) => sum + refund.amount, 0);
    const pendingRefundAmount = order.payment.refunds
      .filter((refund) => refund.status === 'pending')
      .reduce((sum, refund) => sum + refund.amount, 0);

    return {
      ...order,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      refundedAmount,
      pendingRefundAmount,
      balanceDue: Math.max(0, order.total - order.payment.paidAmount),
      allowedNextStatuses: (Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).filter(
        (status) =>
          canTransition(order.status, status) &&
          status !== 'cancelled' &&
          status !== 'return_requested' &&
          status !== 'returned',
      ),
      canCancel: canCancel(order.status),
      canRequestReturn: canRequestReturn(order.status),
      activeReturn:
        [...order.returns].reverse().find((entry) => entry.status !== 'rejected') ?? null,
    };
  }
}

function describeShippingChange(dto: UpdateShippingDto): string {
  const parts: string[] = [];

  if (dto.provider) {
    parts.push(`provider ${dto.provider}`);
  }
  if (dto.trackingNumber) {
    parts.push(`tracking ${dto.trackingNumber}`);
  }
  if (dto.shippedAt) {
    parts.push(`shipped ${dto.shippedAt.toISOString().slice(0, 10)}`);
  }
  if (dto.estimatedDelivery) {
    parts.push(`ETA ${dto.estimatedDelivery.toISOString().slice(0, 10)}`);
  }

  return parts.length > 0 ? `Shipping updated: ${parts.join(', ')}` : 'Shipping note added';
}
