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
  FULFILMENT_FLOW,
  ORDER_STATUS_LABELS,
} from './order-status.js';
import { OrderEvents } from './order-events.js';
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
  PaymentMethod,
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

/**
 * Payment methods that are collected outside a gateway. Only these can be
 * recorded by an operator; anything else must be confirmed by the gateway.
 */
export const OFFLINE_PAYMENT_METHODS: PaymentMethod[] = ['cod', 'manual'];

/** A verified gateway capture, applied to the order it belongs to. */
export interface GatewayPaymentConfirmation {
  orderId: string;
  /** Gateway payment id (`pay_…`) — becomes the order's transaction id. */
  gatewayPaymentId: string;
  /** Amount actually captured, in minor units. */
  amount: number;
  method: PaymentMethod;
  /** Human label for the audit trail (`razorpay`). */
  provider: string;
  capturedAt: Date;
}

export interface GatewayPaymentResult {
  order: OrderRecord;
  /** `false` when this was an idempotent replay of an already-applied capture. */
  applied: boolean;
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
    private readonly orderEvents: OrderEvents,
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

  // ------------------------------------------------------- shipment coupling

  /**
   * Advances fulfilment along **legal order transitions only**.
   *
   * Called by the shipping module when a parcel moves; it deliberately does not
   * accept arbitrary statuses. A target two steps away (e.g. `processing` →
   * `delivered`) is walked one legal step at a time so the order's own history
   * stays truthful, and an order that is cancelled or in a return flow refuses
   * instead of being forced.
   */
  async promoteFulfilment(
    id: string,
    target: 'shipped' | 'out_for_delivery' | 'delivered',
    actor: AuthenticatedUser,
    reason?: string,
  ): Promise<OrderRecord> {
    let current = await this.requireOrder(id);

    if (current.status === target) {
      return current;
    }
    if (
      current.status === 'cancelled' ||
      current.status === 'returned' ||
      current.status === 'return_requested'
    ) {
      throw new ConflictException(
        `Cannot advance a ${ORDER_STATUS_LABELS[current.status].toLowerCase()} order to ${ORDER_STATUS_LABELS[target].toLowerCase()}`,
      );
    }

    const path = findFulfilmentPath(current.status, target);

    if (path.length === 0) {
      throw new ConflictException(
        `Order ${current.orderNumber} cannot move from ${ORDER_STATUS_LABELS[current.status]} to ${ORDER_STATUS_LABELS[target]}`,
      );
    }

    for (const step of path) {
      const now = new Date();
      const set: Record<string, unknown> = { status: step };

      if (step === 'shipped') {
        set['shipping.shippedAt'] = current.shipping?.shippedAt ?? now;
      }
      if (step === 'delivered') {
        set['shipping.deliveredAt'] = now;
      }

      const updated = await this.ordersRepository.apply(
        current.id,
        { status: [current.status] },
        {
          set,
          pushHistory: [
            {
              kind: 'status',
              from: current.status,
              to: step,
              reason,
              note: 'Updated by the shipping module',
              by: { userId: actor.id, email: actor.email },
              at: now,
            },
          ],
        },
      );

      if (!updated) {
        throw new ConflictException(
          'This order changed while the shipment was being updated — reload to see it',
        );
      }

      current = updated;
    }

    return current;
  }

  /**
   * Mirrors parcel facts onto the order's existing `shipping` block.
   *
   * The shipment is the source of truth; the order keeps this denormalised copy so
   * invoices, the order console and older clients keep working unchanged. A mirror
   * never changes the order's status — `promoteFulfilment` does that.
   */
  async applyShipmentMirror(
    id: string,
    mirror: {
      provider?: string;
      trackingNumber?: string;
      trackingUrl?: string;
      shippedAt?: Date;
      estimatedDelivery?: Date;
      deliveredAt?: Date;
    },
    actor: AuthenticatedUser,
    note: string,
  ): Promise<OrderRecord> {
    const order = await this.requireOrder(id);

    if (order.status === 'cancelled' || order.status === 'returned') {
      return order;
    }

    const previous = order.shipping ?? { notes: [] };
    const next = {
      ...previous,
      ...(mirror.provider !== undefined ? { provider: mirror.provider } : {}),
      ...(mirror.trackingNumber !== undefined
        ? { trackingNumber: mirror.trackingNumber }
        : {}),
      ...(mirror.trackingUrl !== undefined ? { trackingUrl: mirror.trackingUrl } : {}),
      ...(mirror.shippedAt !== undefined ? { shippedAt: mirror.shippedAt } : {}),
      ...(mirror.estimatedDelivery !== undefined
        ? { estimatedDelivery: mirror.estimatedDelivery }
        : {}),
      ...(mirror.deliveredAt !== undefined ? { deliveredAt: mirror.deliveredAt } : {}),
    };

    const changed =
      next.provider !== previous.provider ||
      next.trackingNumber !== previous.trackingNumber ||
      next.trackingUrl !== previous.trackingUrl ||
      next.shippedAt?.getTime() !== previous.shippedAt?.getTime() ||
      next.estimatedDelivery?.getTime() !== previous.estimatedDelivery?.getTime() ||
      next.deliveredAt?.getTime() !== previous.deliveredAt?.getTime();

    if (!changed) {
      return order;
    }

    const updated = await this.applyOrConflict(
      id,
      {},
      {
        set: { shipping: next },
        pushHistory: [
          {
            kind: 'shipping',
            note,
            by: { userId: actor.id, email: actor.email },
            at: new Date(),
          },
        ],
      },
    );

    return updated;
  }

  // ---------------------------------------------------------------- payment

  /**
   * Records an **offline** payment (COD collected, bank transfer confirmed).
   *
   * Online payments are deliberately not accepted here: a card/UPI/netbanking/wallet
   * order is only ever marked paid by `confirmGatewayPayment()`, which is called
   * with a signature-verified gateway event. This is the difference between "an
   * operator says the money arrived" and "the gateway says the money arrived", and
   * only the second one is proof.
   */
  async updatePayment(
    id: string,
    dto: UpdatePaymentDto,
    actor: AuthenticatedUser,
  ): Promise<OrderView> {
    const order = await this.requireOrder(id);

    if (!OFFLINE_PAYMENT_METHODS.includes(order.paymentMethod)) {
      throw new BadRequestException(
        `"${order.paymentMethod}" payments are confirmed by the payment gateway and cannot be recorded manually`,
      );
    }
    if (dto.status === 'paid' && !dto.transactionId?.trim()) {
      throw new BadRequestException(
        'A reference (bank transfer id or receipt number) is required to record an offline payment',
      );
    }
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

  /**
   * Applies a **verified** gateway capture to its order.
   *
   * Called by the payments module after a signature-verified checkout response or
   * webhook, never from a controller. Idempotent: replaying the same capture (the
   * webhook and the browser callback routinely race) returns the order untouched
   * instead of writing a second history entry, and the write is guarded on the
   * payment status it was read at.
   */
  async confirmGatewayPayment(
    input: GatewayPaymentConfirmation,
  ): Promise<GatewayPaymentResult> {
    const order = await this.requireOrder(input.orderId);

    if (order.payment.transactionId === input.gatewayPaymentId && order.paymentStatus === 'paid') {
      return { order, applied: false };
    }
    if (order.paymentStatus !== 'pending' && order.paymentStatus !== 'failed') {
      throw new ConflictException(
        `This order's payment is already ${order.paymentStatus.replace(/_/g, ' ')}`,
      );
    }
    if (input.amount !== order.total) {
      throw new BadRequestException(
        'The captured amount does not match the order total — payment left unapplied for review',
      );
    }

    const payment = {
      ...order.payment,
      method: input.method,
      transactionId: input.gatewayPaymentId,
      paidAmount: input.amount,
      paidAt: input.capturedAt,
    };

    const updated = await this.ordersRepository.apply(
      input.orderId,
      { paymentStatus: ['pending', 'failed'] },
      {
        set: { payment, paymentStatus: 'paid' },
        pushHistory: [
          {
            kind: 'payment',
            from: order.paymentStatus,
            to: 'paid',
            note: `Payment captured by ${input.provider} (${input.gatewayPaymentId})`,
            at: input.capturedAt,
          },
        ],
      },
    );

    if (!updated) {
      // Lost a race (typically webhook × checkout callback): a replay is fine, a
      // different capture is a conflict worth surfacing.
      const current = await this.requireOrder(input.orderId);

      if (current.payment.transactionId === input.gatewayPaymentId) {
        return { order: current, applied: false };
      }

      throw new ConflictException(
        'This order changed while the payment was being confirmed — reload to see it',
      );
    }

    this.logger.log(`order ${updated.orderNumber} paid via ${input.provider}`);
    await this.orderEvents.emitRefundChanged(updated);

    return { order: updated, applied: true };
  }

  /** The raw stored order (internal callers such as the payments module). */
  async getOrderRecord(id: string): Promise<OrderRecord> {
    return this.requireOrder(id);
  }

  /** An order the given caller may read (admin or owner), as a raw record. */
  async getOrderRecordFor(id: string, user: AuthenticatedUser): Promise<OrderRecord> {
    const order = await this.requireOrder(id);
    this.assertCanAccess(order, user);

    return order;
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
    const { order } = await this.recordRefund(id, dto, actor);

    return order;
  }

  /**
   * Gateway entry point: records the obligation **and** returns the refund it
   * created, so the caller can execute exactly that refund on the gateway and
   * later finalise the same record.
   */
  async createRefundForGateway(
    id: string,
    dto: CreateRefundDto,
    actor: AuthenticatedUser,
  ): Promise<{ order: OrderView; refund: RefundRecord }> {
    return this.recordRefund(id, dto, actor);
  }

  /**
   * Records a refund **obligation**. It stays `pending` until the money actually
   * moved — by a verified gateway refund or by an admin confirming an offline
   * transfer — and the sum of all refunds can never exceed what was paid.
   *
   * Only one refund may be in flight at a time: a double click, or a retried
   * integration call, is a 409 instead of a second obligation.
   */
  private async recordRefund(
    id: string,
    dto: CreateRefundDto,
    actor: AuthenticatedUser,
  ): Promise<{ order: OrderView; refund: RefundRecord }> {
    const order = await this.requireOrder(id);

    if (order.payment.paidAmount <= 0) {
      throw new BadRequestException('Nothing has been paid on this order, so there is nothing to refund');
    }
    if (order.payment.refunds.some((entry) => entry.status === 'pending')) {
      throw new ConflictException(
        'A refund is already pending on this order — finish or fail it before starting another',
      );
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
      note: dto.note?.trim(),
      source: 'manual',
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

    return { order: this.toView(updated), refund };
  }

  /**
   * Attaches the gateway's refund id to a refund that is still settling.
   *
   * The `refund.processed` webhook only carries the gateway's id, so the link has
   * to exist before the money actually lands — otherwise the webhook could not be
   * matched to the obligation it completes.
   */
  async attachGatewayRefund(
    id: string,
    refundId: string,
    gatewayRefundId: string,
  ): Promise<OrderView> {
    const order = await this.requireOrder(id);

    if (!order.payment.refunds.some((entry) => entry.refundId === refundId)) {
      throw new NotFoundException('Refund not found on this order');
    }

    const refunds = order.payment.refunds.map((entry) =>
      entry.refundId === refundId
        ? { ...entry, gatewayRefundId, source: 'gateway' as const }
        : entry,
    );

    const updated = await this.applyOrConflict(
      id,
      {},
      { set: { payment: { ...order.payment, refunds } } },
    );

    return this.toView(updated);
  }

  /**
   * Marks a pending refund processed or failed.
   *
   * Re-processing an already-finalised refund is a 409, which is what prevents a
   * double click (or a retried integration call) from issuing money twice.
   *
   * `execution` is how a **gateway** refund records the reference the gateway
   * returned; it is not accepted from request bodies.
   */
  async updateRefund(
    id: string,
    refundId: string,
    dto: UpdateRefundDto,
    actor: AuthenticatedUser,
    execution?: { gatewayRefundId?: string; source?: 'gateway' | 'manual' },
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
            gatewayRefundId: execution?.gatewayRefundId ?? entry.gatewayRefundId,
            source: execution?.source ?? entry.source ?? 'manual',
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

    // Any write that touches the refund ledger notifies the payments module,
    // which mirrors the totals onto the gateway transaction. A failed mirror is
    // logged by the listener and never fails the refund itself.
    if (update.set && 'payment' in update.set) {
      await this.orderEvents.emitRefundChanged(updated);
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

/**
 * Shortest legal route between two fulfilment statuses.
 *
 * Restricted to the happy-path statuses: the shipping module must never be able to
 * route an order through `cancelled`, `return_requested` or `returned`.
 */
function findFulfilmentPath(
  from: OrderStatus,
  to: OrderStatus,
): OrderStatus[] {
  if (from === to) {
    return [];
  }

  const queue: Array<{ status: OrderStatus; path: OrderStatus[] }> = [
    { status: from, path: [] },
  ];
  const visited = new Set<OrderStatus>([from]);

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const next of FULFILMENT_FLOW) {
      if (visited.has(next) || !canTransition(current.status, next)) {
        continue;
      }

      const path = [...current.path, next];

      if (next === to) {
        return path;
      }

      visited.add(next);
      queue.push({ status: next, path });
    }
  }

  return [];
}
