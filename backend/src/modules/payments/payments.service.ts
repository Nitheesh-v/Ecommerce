import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { createPaginatedResult } from '../../common/utils/pagination.util.js';
import type { PaginatedResult } from '../../common/utils/pagination.util.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ORDER_STATUS_LABELS } from '../orders/order-status.js';
import { OrderEvents } from '../orders/order-events.js';
import { OrdersService } from '../orders/orders.service.js';
import type { OrderRecord } from '../orders/repositories/orders.repository.js';
import type { PaymentMethod } from '../orders/schemas/order.schema.js';
import { pendingRefundsTotal, processedRefundsTotal } from '../orders/spending.js';
import { PAYMENT_GATEWAY, PaymentGatewayError } from './payment-gateway.js';
import type { GatewayPayment, PaymentGateway } from './payment-gateway.js';
import {
  isOpen,
  isRefundable,
  OPEN_PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  statusAfterRefunds,
} from './payment-status.js';
import { PaymentEventsRepository } from './repositories/payment-events.repository.js';
import type { PaymentEventRecord } from './repositories/payment-events.repository.js';
import { PaymentsRepository } from './repositories/payments.repository.js';
import type { PaymentRecord } from './repositories/payments.repository.js';
import { AdminPaymentsQueryDto } from './dto/payments-query.dto.js';
import type {
  CreatePaymentOrderDto,
  RefundPaymentDto,
  VerifyPaymentDto,
} from './dto/payment-actions.dto.js';

/** The public half of the gateway configuration (never contains a secret). */
export interface CheckoutConfigView {
  provider: 'razorpay' | 'disabled';
  enabled: boolean;
  testMode: boolean;
  /** Publishable key id; the key *secret* never leaves the server. */
  keyId: string | null;
  currency: string;
  webhooksEnabled: boolean;
}

/** A transaction as the console renders it. */
export interface PaymentView {
  id: string;
  orderId: string;
  orderNumber: string;
  customer: {
    userId: string | null;
    name: string;
    email: string;
  };
  amount: number;
  currency: string;
  method: PaymentMethod;
  methodLabel: string;
  provider: string;
  status: string;
  statusLabel: string;
  testMode: boolean;
  gateway: {
    orderId: string | null;
    paymentId: string | null;
    signatureVerified: boolean;
    verifiedWithGateway: boolean;
  };
  failureReason: string | null;
  refundedAmount: number;
  pendingRefundAmount: number;
  refundableAmount: number;
  capturedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRefundView {
  refundId: string;
  amount: number;
  status: 'pending' | 'processed' | 'failed';
  reason: string;
  reference?: string;
  gatewayRefundId?: string;
  source: 'gateway' | 'manual';
  requestedAt: string;
  processedAt: string | null;
  note?: string;
}

export interface PaymentEventView {
  id: string;
  type: string;
  label: string;
  source: string;
  message: string;
  gatewayReference: string | null;
  at: string;
}

export interface PaymentTimelineEntry {
  id: string;
  kind: 'payment' | 'refund' | 'order';
  label: string;
  detail?: string;
  at: string;
  actor?: string | null;
}

export interface PaymentOrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  statusLabel: string;
  paymentStatus: string;
  total: number;
  currency: string;
  createdAt: string;
  items: Array<{ name: string; sku: string; quantity: number; lineTotal: number }>;
  shippingAddress: {
    recipientName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  customer: { name: string; email: string; phone?: string };
}

export interface PaymentDetailView extends PaymentView {
  order: PaymentOrderSummary;
  refunds: PaymentRefundView[];
  events: PaymentEventView[];
  timeline: PaymentTimelineEntry[];
}

export interface PaymentHistoryView {
  events: PaymentEventView[];
  timeline: PaymentTimelineEntry[];
}

export interface PaymentSummaryView {
  totalCount: number;
  totalAmount: number;
  successfulCount: number;
  successfulAmount: number;
  pendingCount: number;
  pendingAmount: number;
  failedCount: number;
  failedAmount: number;
  refundedAmount: number;
  currency: string;
}

/** Payload the browser needs to open the checkout widget. */
export interface CheckoutSessionView {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  provider: 'razorpay' | 'disabled';
  keyId: string | null;
  testMode: boolean;
  gatewayOrderId: string;
  status: string;
  prefill: { name: string; email: string; contact?: string };
  notes: Record<string, string>;
}

export interface VerifyPaymentView {
  verified: boolean;
  status: string;
  statusLabel: string;
  payment: PaymentView;
  order: PaymentOrderSummary | null;
}

export interface RefundResultView {
  refund: PaymentRefundView;
  payment: PaymentView;
}

interface GatewayWebhookPayload {
  event?: string;
  event_id?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        status?: string;
        method?: string;
        captured?: boolean;
        error_code?: string;
        error_description?: string;
        created_at?: number;
      };
    };
    refund?: {
      entity?: {
        id?: string;
        payment_id?: string;
        amount?: number;
        status?: string;
        receipt?: string;
      };
    };
    order?: { entity?: { id?: string; status?: string; amount?: number } };
  };
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cod: 'Cash on delivery',
  card: 'Card',
  upi: 'UPI',
  netbanking: 'Net banking',
  wallet: 'Wallet',
  manual: 'Manual / bank transfer',
};

const GATEWAY_METHODS: Record<string, PaymentMethod> = {
  card: 'card',
  upi: 'upi',
  netbanking: 'netbanking',
  wallet: 'wallet',
  cod: 'cod',
};

/** Attribution for events the system applies on its own (webhooks). */
const SYSTEM_ACTOR: AuthenticatedUser = {
  id: 'system',
  email: 'payments@system',
  role: Role.Admin,
};

const EVENT_LABELS: Record<string, string> = {
  'payment.order_created': 'Payment attempt created',
  'payment.order_failed': 'Gateway order could not be created',
  'payment.authorized': 'Payment authorized',
  'payment.captured': 'Payment captured',
  'payment.failed': 'Payment failed',
  'payment.cancelled': 'Payment cancelled',
  'payment.partially_refunded': 'Partial refund processed',
  'payment.refunded': 'Payment fully refunded',
  'checkout.verified': 'Checkout signature verified',
  'checkout.signature_invalid': 'Checkout signature rejected',
  'checkout.pending': 'Payment awaiting completion',
  'refund.executed': 'Refund sent to the gateway',
  'refund.processed': 'Refund processed',
  'refund.failed': 'Refund failed',
  'webhook.unhandled': 'Webhook recorded (no action)',
};

/**
 * Payment management.
 *
 * Ownership of state is deliberately split:
 * - **this module** owns the gateway transaction (attempts, gateway ids, events);
 * - **the order** owns the money (paid amount, refunds) — see `OrdersService`.
 *
 * Consequences that the code enforces:
 * 1. A payment status only ever changes from a verified signature, a gateway
 *    fetch, or a signed webhook. There is no endpoint that sets it.
 * 2. A capture is applied to the order through `confirmGatewayPayment()`, which
 *    is guarded on the order's payment status and idempotent, so the checkout
 *    callback and the webhook can race safely.
 * 3. Refunds are recorded on the order first (audited obligation), then executed
 *    on the gateway, then finalised with the gateway's own refund id.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly payments: PaymentsRepository,
    private readonly events: PaymentEventsRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly ordersService: OrdersService,
    private readonly orderEvents: OrderEvents,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    // Mirror refund totals from the order onto the gateway transaction. One-way:
    // the order stays the only writer of money.
    this.unsubscribe = this.orderEvents.onRefundChanged((order) =>
      this.syncRefundsForOrder(order),
    );
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  // ------------------------------------------------------------------ config

  checkoutConfig(): CheckoutConfigView {
    return {
      provider: this.gateway.descriptor.provider,
      enabled: this.gateway.descriptor.enabled,
      testMode: this.gateway.descriptor.testMode,
      keyId: this.gateway.descriptor.publicKeyId,
      currency: 'INR',
      webhooksEnabled: this.gateway.descriptor.webhooksEnabled,
    };
  }

  // --------------------------------------------------------------- checkout

  /**
   * Starts (or resumes) a payment attempt for the caller's own order.
   *
   * The amount always comes from the stored order. An existing open attempt for
   * the same total is reused, so double-clicking "Pay" cannot create two gateway
   * orders for one checkout.
   */
  async createPaymentOrder(
    user: AuthenticatedUser,
    dto: CreatePaymentOrderDto,
  ): Promise<CheckoutSessionView> {
    this.assertGatewayEnabled();

    const order = await this.ordersService.getOrderRecordFor(dto.orderId, user);

    if (order.paymentStatus !== 'pending' && order.paymentStatus !== 'failed') {
      throw new ConflictException(
        `This order's payment is already ${order.paymentStatus.replace(/_/g, ' ')}`,
      );
    }
    if (order.total <= 0) {
      throw new BadRequestException('This order has nothing to pay');
    }

    const existing = await this.payments.findOpenForOrder(order.id);

    if (existing?.gatewayOrderId && existing.amount === order.total) {
      return this.toCheckoutSession(existing, order);
    }

    const attempt =
      existing ??
      (await this.payments.create({
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        amount: order.total,
        currency: order.currency,
        provider: this.gateway.descriptor.provider === 'razorpay' ? 'razorpay' : 'manual',
        method: order.paymentMethod,
        status: 'pending',
      }));

    try {
      const gatewayOrder = await this.gateway.createOrder({
        amount: order.total,
        currency: order.currency,
        receipt: order.orderNumber,
        notes: { orderNumber: order.orderNumber, orderId: order.id },
      });

      const updated = await this.payments.update(
        attempt.id,
        { status: ['pending'] },
        {
          gatewayOrderId: gatewayOrder.id,
          gatewayStatus: gatewayOrder.status,
          latestEvent: 'payment.order_created',
          lastEventAt: new Date(),
        },
      );

      const current = updated ?? (await this.requirePayment(attempt.id));

      await this.recordEvent({
        type: 'payment.order_created',
        source: 'system',
        message: `Payment attempt started for order ${order.orderNumber}`,
        paymentId: current.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        gatewayReference: gatewayOrder.id,
      });

      return this.toCheckoutSession(current, order);
    } catch (error) {
      const reason = gatewayMessage(error);

      await this.payments.update(
        attempt.id,
        { status: ['pending'] },
        {
          status: 'failed',
          failureReason: reason,
          failedAt: new Date(),
          latestEvent: 'payment.order_failed',
          lastEventAt: new Date(),
        },
      );

      await this.recordEvent({
        type: 'payment.order_failed',
        source: 'system',
        message: reason,
        paymentId: attempt.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
      });

      throw this.toHttpError(error, 'The payment could not be started');
    }
  }

  /**
   * Verifies the checkout callback.
   *
   * The browser's word is never enough: the signature proves the ids came from
   * the gateway, and the payment is then re-read from the gateway API before any
   * status is written. Replaying a successful verification is idempotent.
   */
  async verifyPayment(
    user: AuthenticatedUser,
    dto: VerifyPaymentDto,
  ): Promise<VerifyPaymentView> {
    this.assertGatewayEnabled();

    const payment = await this.payments.findByGatewayOrderId(dto.gatewayOrderId);

    if (!payment) {
      throw new NotFoundException('Payment attempt not found');
    }

    this.assertOwnership(payment, user);

    if (payment.status === 'captured' || payment.status === 'partially_refunded' || payment.status === 'refunded') {
      if (payment.gatewayPaymentId && payment.gatewayPaymentId !== dto.gatewayPaymentId) {
        throw new ConflictException('This payment attempt was already completed by another payment');
      }
      // Self-heal: if a previous attempt recorded the capture but failed to apply
      // it to the order, doing it again is a no-op.
      await this.applyCaptureToOrder(payment);
      const order = await this.safeOrder(payment.orderId);
      const current = (await this.payments.findById(payment.id)) ?? payment;

      return {
        verified: true,
        status: current.status,
        statusLabel: PAYMENT_STATUS_LABELS[current.status],
        payment: this.toView(current),
        order: order ? this.toOrderSummary(order) : null,
      };
    }

    if (!isOpen(payment.status)) {
      throw new ConflictException(
        `This payment is already ${PAYMENT_STATUS_LABELS[payment.status].toLowerCase()}`,
      );
    }

    const signatureValid = this.gateway.verifyCheckoutSignature({
      gatewayOrderId: dto.gatewayOrderId,
      gatewayPaymentId: dto.gatewayPaymentId,
      signature: dto.signature,
    });

    if (!signatureValid) {
      await this.recordEvent({
        type: 'checkout.signature_invalid',
        source: 'verify',
        message: 'A checkout callback failed signature verification and was ignored',
        paymentId: payment.id,
        orderId: payment.orderId,
        orderNumber: payment.orderNumber,
      });

      throw new BadRequestException('The payment signature could not be verified');
    }

    let remote: GatewayPayment;

    try {
      remote = await this.gateway.fetchPayment(dto.gatewayPaymentId);
    } catch (error) {
      throw this.toHttpError(error, 'The payment could not be confirmed with the gateway');
    }

    if (remote.orderId !== payment.gatewayOrderId) {
      throw new BadRequestException('This payment does not belong to the gateway order');
    }
    if (remote.amount !== payment.amount) {
      throw new BadRequestException('The paid amount does not match the order total');
    }

    await this.recordEvent({
      type: 'checkout.verified',
      source: 'verify',
      message: `Checkout signature verified for ${orderRef(payment)} (gateway status: ${remote.status})`,
      paymentId: payment.id,
      orderId: payment.orderId,
      orderNumber: payment.orderNumber,
      gatewayReference: remote.id,
    });

    const updated = await this.applyGatewayOutcome(payment, remote, 'verify', {
      signatureVerified: true,
    });

    const order = await this.safeOrder(payment.orderId);

    if (isOpen(updated.status)) {
      await this.recordEvent({
        type: 'checkout.pending',
        source: 'verify',
        message: `Verification succeeded but the gateway still reports ${remote.status}`,
        paymentId: payment.id,
        orderId: payment.orderId,
        orderNumber: payment.orderNumber,
        gatewayReference: remote.id,
      });
    }

    return {
      verified: true,
      status: updated.status,
      statusLabel: PAYMENT_STATUS_LABELS[updated.status],
      payment: this.toView(updated),
      order: order ? this.toOrderSummary(order) : null,
    };
  }

  // ---------------------------------------------------------------- webhook

  /**
   * Applies a gateway webhook.
   *
   * Order of operations: signature first (over the **raw** bytes), then claim the
   * event id, then apply. A duplicate delivery is answered 200 without side
   * effects; a failed application releases the claim so the gateway's retry can
   * finish the work.
   */
  async handleWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    eventIdHeader?: string,
  ): Promise<{ received: boolean; duplicate: boolean; handled: boolean; eventId: string }> {
    if (!this.gateway.descriptor.webhooksEnabled) {
      throw new ServiceUnavailableException(
        'Payment webhooks are not configured on this server',
      );
    }
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('The webhook body is required');
    }
    if (!signature) {
      throw new BadRequestException('The webhook signature header is required');
    }
    if (!this.gateway.verifyWebhookSignature(rawBody, signature)) {
      this.logger.warn('Rejected a payment webhook with an invalid signature');

      throw new BadRequestException('Invalid webhook signature');
    }

    let payload: GatewayWebhookPayload;

    try {
      payload = JSON.parse(rawBody.toString('utf8')) as GatewayWebhookPayload;
    } catch {
      throw new BadRequestException('The webhook body is not valid JSON');
    }

    const type = String(payload.event ?? 'unknown');
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    const eventId = (eventIdHeader ?? payload.event_id ?? '').trim() || payloadHash;
    const payment = await this.resolveWebhookPayment(payload);

    const claimed = await this.events.record({
      eventId,
      paymentId: payment?.id ?? null,
      orderId: payment?.orderId ?? null,
      orderNumber: payment?.orderNumber ?? null,
      type,
      source: 'webhook',
      message: `Webhook ${type} received${payment ? ` for ${orderRef(payment)}` : ''}`,
      gatewayReference: webhookReference(payload),
      payloadHash,
    });

    if (!claimed) {
      this.logger.log(`Ignoring duplicate webhook ${eventId} (${type})`);

      return { received: true, duplicate: true, handled: false, eventId };
    }

    try {
      const handled = await this.applyWebhookEvent(type, payload, payment);

      if (!handled) {
        await this.recordEvent({
          type: 'webhook.unhandled',
          source: 'webhook',
          message: `Webhook ${type} recorded but required no change`,
          paymentId: payment?.id ?? null,
          orderId: payment?.orderId ?? null,
          orderNumber: payment?.orderNumber ?? null,
          gatewayReference: webhookReference(payload),
        });
      }

      return { received: true, duplicate: false, handled, eventId };
    } catch (error) {
      // Release the claim: the gateway retries non-2xx, and the retry must be
      // allowed to do the work instead of being skipped as a duplicate.
      await this.events.release(eventId);
      this.logger.error(
        `Webhook ${eventId} (${type}) failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      throw error instanceof HttpException
        ? error
        : new ServiceUnavailableException('The webhook could not be applied — retry later');
    }
  }

  // ------------------------------------------------------------------ admin

  async list(query: AdminPaymentsQueryDto): Promise<PaginatedResult<PaymentView>> {
    const { items, total } = await this.payments.list({
      page: query.page,
      limit: query.limit,
      search: query.search?.trim(),
      status: query.status,
      method: query.method,
      from: query.from,
      to: query.to,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return createPaginatedResult(
      items.map((item) => this.toView(item)),
      query.page,
      query.limit,
      total,
    );
  }

  async summary(): Promise<PaymentSummaryView> {
    const summary = await this.payments.summary();

    return { ...summary, currency: summary.currency || 'INR' };
  }

  async detail(id: string): Promise<PaymentDetailView> {
    const payment = await this.requirePayment(id);
    const order = await this.ordersService.getOrderRecord(payment.orderId);
    const [events, history] = await Promise.all([
      this.events.listForPayment(payment.id),
      Promise.resolve(this.buildTimeline(payment, order)),
    ]);

    return {
      ...this.toView(payment),
      order: this.toOrderSummary(order),
      refunds: order.payment.refunds
        .slice()
        .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
        .map((refund) => this.toRefundView(refund)),
      events: events.map((event) => this.toEventView(event)),
      timeline: history,
    };
  }

  async history(id: string): Promise<PaymentHistoryView> {
    const payment = await this.requirePayment(id);
    const [events, order] = await Promise.all([
      this.events.listForPayment(payment.id),
      this.ordersService.getOrderRecord(payment.orderId),
    ]);

    return {
      events: events.map((event) => this.toEventView(event)),
      timeline: this.buildTimeline(payment, order),
    };
  }

  /**
   * Refunds (part of) a captured gateway payment.
   *
   * The obligation is recorded on the order **before** the gateway is called, so a
   * crash mid-flight leaves an auditable pending refund rather than an invisible
   * one. A second refund while one is pending is a 409, and the sum can never
   * exceed what was captured.
   */
  async refundPayment(
    id: string,
    dto: RefundPaymentDto,
    actor: AuthenticatedUser,
  ): Promise<RefundResultView> {
    this.assertGatewayEnabled();

    const payment = await this.requirePayment(id);

    if (!payment.gatewayPaymentId || !isRefundable(payment.status)) {
      throw new ConflictException(
        'Only a captured payment can be refunded — nothing else has money to return',
      );
    }

    const order = await this.ordersService.getOrderRecord(payment.orderId);
    const committed = order.payment.refunds
      .filter((refund) => refund.status !== 'failed')
      .reduce((sum, refund) => sum + refund.amount, 0);
    const remaining = Math.max(0, order.payment.paidAmount - committed);

    if (remaining <= 0) {
      throw new ConflictException('This payment has already been fully refunded');
    }
    if (dto.amount > remaining) {
      throw new BadRequestException(
        `Refund exceeds the refundable amount (${this.formatMoney(remaining, order.currency)} remaining)`,
      );
    }

    // Duplicate protection + audit entry live in the order service.
    const { refund } = await this.ordersService.createRefundForGateway(
      order.id,
      { amount: dto.amount, reason: dto.reason, note: dto.note },
      actor,
    );

    let gatewayRefund;

    try {
      gatewayRefund = await this.gateway.refund({
        gatewayPaymentId: payment.gatewayPaymentId,
        amount: refund.amount,
        receipt: refund.refundId,
        notes: {
          orderNumber: order.orderNumber,
          reason: refund.reason.slice(0, 200),
        },
      });
    } catch (error) {
      const reason = gatewayMessage(error);

      await this.ordersService
        .updateRefund(
          order.id,
          refund.refundId,
          { status: 'failed', note: `Gateway refund failed: ${reason}` },
          actor,
          { source: 'manual' },
        )
        .catch(() => undefined);

      await this.recordEvent({
        type: 'refund.failed',
        source: 'admin',
        message: reason,
        paymentId: payment.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
      });

      throw this.toHttpError(error, 'The gateway could not process the refund');
    }

    const reference = `${this.gateway.descriptor.provider}:${gatewayRefund.id}`;

    if (gatewayRefund.status === 'failed') {
      await this.ordersService.updateRefund(
        order.id,
        refund.refundId,
        {
          status: 'failed',
          reference,
          note: 'The gateway reported the refund as failed',
        },
        actor,
        { gatewayRefundId: gatewayRefund.id, source: 'gateway' },
      );
    } else if (gatewayRefund.status === 'processed') {
      await this.ordersService.updateRefund(
        order.id,
        refund.refundId,
        {
          status: 'processed',
          reference,
          note: 'Refund processed by the payment gateway',
        },
        actor,
        { gatewayRefundId: gatewayRefund.id, source: 'gateway' },
      );
    } else {
      // Still settling at the gateway: attach the id so the `refund.processed`
      // webhook can finalise exactly this refund.
      await this.ordersService.attachGatewayRefund(
        order.id,
        refund.refundId,
        gatewayRefund.id,
      );
    }

    await this.recordEvent({
      type: 'refund.executed',
      source: 'admin',
      message: `Refund of ${this.formatMoney(gatewayRefund.amount, order.currency)} sent by ${actor.email} (gateway status: ${gatewayRefund.status})`,
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      gatewayReference: gatewayRefund.id,
    });

    const [freshOrder, freshPayment] = await Promise.all([
      this.ordersService.getOrderRecord(order.id),
      this.payments.findById(payment.id),
    ]);
    const current = freshPayment ?? payment;
    const freshRefund =
      freshOrder.payment.refunds.find((entry) => entry.refundId === refund.refundId) ??
      refund;

    return {
      refund: this.toRefundView(freshRefund),
      payment: this.toView(current),
    };
  }

  // -------------------------------------------------------------- refund sync

  /**
   * Mirrors the order's refund ledger onto its captured transaction.
   *
   * Called by the order-event listener, so a refund finalised from the **orders**
   * console (an offline transfer, or a return) keeps the payments console honest.
   */
  async syncRefundsForOrder(order: OrderRecord): Promise<void> {
    const payment = await this.payments.findSettledForOrder(order.id);

    if (!payment) {
      return;
    }

    const processed = processedRefundsTotal(order);
    const pending = pendingRefundsTotal(order);
    const status = statusAfterRefunds(payment.status, payment.amount, processed);

    if (
      payment.refundedAmount === processed &&
      payment.pendingRefundAmount === pending &&
      payment.status === status
    ) {
      return;
    }

    await this.payments.update(
      payment.id,
      {},
      {
        refundedAmount: processed,
        pendingRefundAmount: pending,
        status,
        latestEvent: status === payment.status ? payment.latestEvent : `payment.${status}`,
        lastEventAt: new Date(),
      },
    );
  }

  // ---------------------------------------------------------------- internals

  private async applyWebhookEvent(
    type: string,
    payload: GatewayWebhookPayload,
    payment: PaymentRecord | null,
  ): Promise<boolean> {
    if (!payment) {
      return false;
    }

    switch (type) {
      case 'payment.captured': {
        const entity = payload.payload?.payment?.entity;

        if (!entity?.id) {
          return false;
        }

        await this.applyGatewayOutcome(
          payment,
          {
            id: entity.id,
            orderId: entity.order_id ?? null,
            amount: Number(entity.amount ?? 0),
            currency: entity.currency ?? payment.currency,
            status: entity.status ?? 'captured',
            method: entity.method ?? payment.method,
            captured: true,
          },
          'webhook',
          {},
        );

        return true;
      }

      case 'payment.authorized': {
        const entity = payload.payload?.payment?.entity;

        if (!entity?.id) {
          return false;
        }

        await this.markAuthorized(payment, entity.id, entity.status ?? 'authorized', 'webhook');

        return true;
      }

      case 'payment.failed': {
        const entity = payload.payload?.payment?.entity;
        const reason =
          entity?.error_description?.trim() ||
          'The gateway reported the payment as failed';

        await this.markFailed(payment, reason, entity?.id, 'webhook');

        return true;
      }

      case 'refund.processed':
      case 'refund.failed': {
        const entity = payload.payload?.refund?.entity;

        if (!entity?.id) {
          return false;
        }

        return this.applyRefundWebhook(
          payment,
          entity.id,
          type === 'refund.processed' ? 'processed' : 'failed',
        );
      }

      /**
       * `order.paid` carries no payment id; the following `payment.captured`
       * event does the work. Recorded only, so nothing is applied twice.
       */
      case 'order.paid':
      default:
        return false;
    }
  }

  private async applyRefundWebhook(
    payment: PaymentRecord,
    gatewayRefundId: string,
    status: 'processed' | 'failed',
  ): Promise<boolean> {
    const order = await this.ordersService.getOrderRecord(payment.orderId);
    const refund = order.payment.refunds.find(
      (entry) => entry.gatewayRefundId === gatewayRefundId,
    );

    if (!refund) {
      this.logger.warn(
        `Webhook referenced refund ${gatewayRefundId}, which is not recorded on order ${order.orderNumber}`,
      );

      return false;
    }
    if (refund.status !== 'pending') {
      // Already finalised — replay.
      return true;
    }

    await this.ordersService.updateRefund(
      order.id,
      refund.refundId,
      {
        status,
        reference: `${payment.provider}:${gatewayRefundId}`,
        note: 'Confirmed by the payment gateway webhook',
      },
      SYSTEM_ACTOR,
      { gatewayRefundId, source: 'gateway' },
    );

    return true;
  }

  /** Applies a gateway-reported outcome (capture, authorization or failure). */
  private async applyGatewayOutcome(
    payment: PaymentRecord,
    remote: GatewayPayment,
    source: 'verify' | 'webhook',
    flags: { signatureVerified?: boolean },
  ): Promise<PaymentRecord> {
    if (remote.status === 'failed') {
      return this.markFailed(payment, 'The gateway reported the payment as failed', remote.id, source);
    }
    if (remote.status === 'captured' || remote.captured) {
      return this.markCaptured(payment, remote, source, flags);
    }
    if (remote.status === 'authorized') {
      return this.markAuthorized(payment, remote.id, remote.status, source);
    }

    return payment;
  }

  private async markCaptured(
    payment: PaymentRecord,
    remote: GatewayPayment,
    _source: 'verify' | 'webhook',
    flags: { signatureVerified?: boolean },
  ): Promise<PaymentRecord> {
    const now = new Date();
    const method = this.toPaymentMethod(remote.method, payment.method);

    const updated = await this.payments.update(
      payment.id,
      { status: OPEN_PAYMENT_STATUSES },
      {
        status: 'captured',
        gatewayStatus: remote.status,
        gatewayPaymentId: remote.id,
        method,
        capturedAt: now,
        verifiedWithGateway: true,
        signatureVerified: flags.signatureVerified ?? payment.signatureVerified,
        failureReason: null,
        latestEvent: 'payment.captured',
        lastEventAt: now,
      },
    );

    const current = updated ?? (await this.requirePayment(payment.id));

    if (!updated && current.status !== 'captured') {
      throw new ConflictException(
        'This payment changed while it was being confirmed — reload to see it',
      );
    }

    await this.applyCaptureToOrder(current);

    return (await this.payments.findById(current.id)) ?? current;
  }

  private async applyCaptureToOrder(payment: PaymentRecord): Promise<void> {
    if (!payment.gatewayPaymentId) {
      return;
    }

    await this.ordersService.confirmGatewayPayment({
      orderId: payment.orderId,
      gatewayPaymentId: payment.gatewayPaymentId,
      amount: payment.amount,
      method: payment.method,
      provider: payment.provider,
      capturedAt: payment.capturedAt ?? new Date(),
    });
  }

  private async markAuthorized(
    payment: PaymentRecord,
    gatewayPaymentId: string,
    gatewayStatus: string,
    _source: 'verify' | 'webhook',
  ): Promise<PaymentRecord> {
    const updated = await this.payments.update(
      payment.id,
      { status: ['pending', 'authorized'] },
      {
        status: 'authorized',
        gatewayStatus,
        gatewayPaymentId,
        verifiedWithGateway: true,
        latestEvent: 'payment.authorized',
        lastEventAt: new Date(),
      },
    );

    return updated ?? (await this.payments.findById(payment.id)) ?? payment;
  }

  /**
   * Tells the customer a payment attempt failed.
   *
   * Only sent when the payment actually transitioned to `failed` (guarded above) and
   * only when the order still belongs to someone: a guest order has an email but no
   * account, and a guest is still a customer, so the address is enough.
   */
  private async notifyPaymentFailed(payment: PaymentRecord, reason: string): Promise<void> {
    const order = await this.safeOrder(payment.orderId);

    if (!order) {
      return;
    }

    await this.notifications.notify({
      type: 'payment_failed',
      audience: 'customer',
      userId: order.userId,
      recipientEmail: order.customerEmail,
      recipientName: order.customerName,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        amount: payment.amount,
        currency: payment.currency ?? order.currency,
        reason,
        method: payment.method,
      },
      dedupeKey: `payment_failed:${payment.id}`,
    });
  }

  private async markFailed(
    payment: PaymentRecord,
    reason: string,
    gatewayPaymentId: string | undefined,
    _source: 'verify' | 'webhook',
  ): Promise<PaymentRecord> {
    const updated = await this.payments.update(
      payment.id,
      { status: OPEN_PAYMENT_STATUSES },
      {
        status: 'failed',
        gatewayStatus: 'failed',
        gatewayPaymentId: gatewayPaymentId ?? payment.gatewayPaymentId,
        failureReason: reason.slice(0, 500),
        failedAt: new Date(),
        verifiedWithGateway: true,
        latestEvent: 'payment.failed',
        lastEventAt: new Date(),
      },
    );

    const current = updated ?? (await this.payments.findById(payment.id)) ?? payment;

    if (updated) {
      // `notify()` never throws and the `dedupeKey` is unique, so a webhook replay
      // cannot produce a second "payment failed" email.
      await this.notifyPaymentFailed(current, reason);
    }

    return current;
  }

  private async resolveWebhookPayment(
    payload: GatewayWebhookPayload,
  ): Promise<PaymentRecord | null> {
    const paymentEntity = payload.payload?.payment?.entity;
    const refundEntity = payload.payload?.refund?.entity;
    const orderEntity = payload.payload?.order?.entity;

    if (paymentEntity?.order_id) {
      const byOrder = await this.payments.findByGatewayOrderId(paymentEntity.order_id);

      if (byOrder) {
        return byOrder;
      }
    }
    if (paymentEntity?.id) {
      const byPayment = await this.payments.findByGatewayPaymentId(paymentEntity.id);

      if (byPayment) {
        return byPayment;
      }
    }
    if (refundEntity?.payment_id) {
      const byRefundPayment = await this.payments.findByGatewayPaymentId(
        refundEntity.payment_id,
      );

      if (byRefundPayment) {
        return byRefundPayment;
      }
    }
    if (orderEntity?.id) {
      return this.payments.findByGatewayOrderId(orderEntity.id);
    }

    return null;
  }

  private buildTimeline(
    payment: PaymentRecord,
    order: OrderRecord,
  ): PaymentTimelineEntry[] {
    const entries: PaymentTimelineEntry[] = order.history
      .filter((entry) =>
        ['payment', 'refund', 'cancellation', 'return'].includes(entry.kind),
      )
      .map((entry, index) => ({
        id: `order-${payment.id}-${index}`,
        kind: entry.kind === 'refund' ? 'refund' : 'payment',
        label: `${entry.kind === 'refund' ? 'Refund' : 'Payment'} ${entry.to ? `→ ${entry.to}` : 'update'}`,
        detail: entry.note,
        at: entry.at.toISOString(),
        actor: entry.by?.email ?? null,
      }));

    entries.push({
      id: `payment-${payment.id}-created`,
      kind: 'payment',
      label: 'Payment attempt created',
      detail: `${payment.provider} · ${payment.orderNumber}`,
      at: payment.createdAt.toISOString(),
    });

    if (payment.capturedAt) {
      entries.push({
        id: `payment-${payment.id}-captured`,
        kind: 'payment',
        label: 'Payment captured',
        detail: payment.gatewayPaymentId ? `Gateway payment ${payment.gatewayPaymentId}` : undefined,
        at: payment.capturedAt.toISOString(),
      });
    }
    if (payment.failedAt) {
      entries.push({
        id: `payment-${payment.id}-failed`,
        kind: 'payment',
        label: 'Payment failed',
        detail: payment.failureReason,
        at: payment.failedAt.toISOString(),
      });
    }

    return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }

  private toCheckoutSession(payment: PaymentRecord, order: OrderRecord): CheckoutSessionView {
    if (!payment.gatewayOrderId) {
      throw new ConflictException('This payment attempt has no gateway order — start a new one');
    }

    return {
      paymentId: payment.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: payment.amount,
      currency: payment.currency,
      provider: this.gateway.descriptor.provider,
      keyId: this.gateway.descriptor.publicKeyId,
      testMode: this.gateway.descriptor.testMode,
      gatewayOrderId: payment.gatewayOrderId,
      status: payment.status,
      prefill: {
        name: order.customerName,
        email: order.customerEmail,
        contact: order.customerPhone ?? order.shippingAddress.phone,
      },
      notes: { orderNumber: order.orderNumber },
    };
  }

  private toView(payment: PaymentRecord): PaymentView {
    const refundableAmount = Math.max(
      0,
      payment.amount - payment.refundedAmount - payment.pendingRefundAmount,
    );

    return {
      id: payment.id,
      orderId: payment.orderId,
      orderNumber: payment.orderNumber,
      customer: {
        userId: payment.userId,
        name: payment.customerName,
        email: payment.customerEmail,
      },
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      methodLabel: METHOD_LABELS[payment.method],
      provider: payment.provider,
      status: payment.status,
      statusLabel: PAYMENT_STATUS_LABELS[payment.status],
      testMode: this.gateway.descriptor.testMode,
      gateway: {
        orderId: payment.gatewayOrderId ?? null,
        paymentId: payment.gatewayPaymentId ?? null,
        signatureVerified: payment.signatureVerified,
        verifiedWithGateway: payment.verifiedWithGateway,
      },
      failureReason: payment.failureReason ?? null,
      refundedAmount: payment.refundedAmount,
      pendingRefundAmount: payment.pendingRefundAmount,
      refundableAmount,
      capturedAt: payment.capturedAt?.toISOString() ?? null,
      failedAt: payment.failedAt?.toISOString() ?? null,
      cancelledAt: payment.cancelledAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    };
  }

  private toRefundView(
    refund: OrderRecord['payment']['refunds'][number],
  ): PaymentRefundView {
    return {
      refundId: refund.refundId,
      amount: refund.amount,
      status: refund.status,
      reason: refund.reason,
      reference: refund.reference,
      gatewayRefundId: refund.gatewayRefundId,
      source: refund.source ?? 'manual',
      requestedAt: refund.requestedAt.toISOString(),
      processedAt: refund.processedAt?.toISOString() ?? null,
      note: refund.note,
    };
  }

  private toOrderSummary(order: OrderRecord): PaymentOrderSummary {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status],
      paymentStatus: order.paymentStatus,
      total: order.total,
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      })),
      shippingAddress: { ...order.shippingAddress },
      customer: {
        name: order.customerName,
        email: order.customerEmail,
        phone: order.customerPhone,
      },
    };
  }

  private toEventView(event: PaymentEventRecord): PaymentEventView {
    return {
      id: event.id,
      type: event.type,
      label: EVENT_LABELS[event.type] ?? event.type,
      source: event.source,
      message: event.message,
      gatewayReference: event.gatewayReference ?? null,
      at: event.receivedAt.toISOString(),
    };
  }

  private async recordEvent(input: {
    type: string;
    source: 'system' | 'verify' | 'admin' | 'webhook';
    message: string;
    paymentId: string | null;
    orderId: string | null;
    orderNumber: string | null;
    gatewayReference?: string;
  }): Promise<void> {
    const digest = createHash('sha256')
      .update(`${input.type}|${input.paymentId ?? ''}|${Date.now()}|${Math.random()}`)
      .digest('hex');

    try {
      await this.events.record({
        eventId: `${input.type}:${digest}`,
        paymentId: input.paymentId,
        orderId: input.orderId,
        orderNumber: input.orderNumber,
        type: input.type,
        source: input.source,
        message: input.message.slice(0, 500),
        gatewayReference: input.gatewayReference,
        payloadHash: digest,
      });
    } catch (error) {
      // An audit-trail write must never break a payment flow.
      this.logger.warn(
        `Could not record payment event ${input.type}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private toPaymentMethod(method: string | undefined, fallback: PaymentMethod): PaymentMethod {
    return GATEWAY_METHODS[(method ?? '').toLowerCase()] ?? fallback;
  }

  private async requirePayment(id: string): Promise<PaymentRecord> {
    const payment = await this.payments.findById(id);

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  private async safeOrder(orderId: string): Promise<OrderRecord | null> {
    try {
      return await this.ordersService.getOrderRecord(orderId);
    } catch {
      return null;
    }
  }

  /**
   * Ownership check: someone else's payment answers **404**, so ids cannot be
   * probed. Admins may act on any payment (refunds live on admin routes only).
   */
  private assertOwnership(payment: PaymentRecord, user: AuthenticatedUser): void {
    if (user.role === Role.Admin) {
      return;
    }
    if (payment.userId !== user.id) {
      throw new NotFoundException('Payment not found');
    }
  }

  private assertGatewayEnabled(): void {
    if (!this.gateway.descriptor.enabled) {
      throw new ServiceUnavailableException(
        'Online payments are not configured on this server',
      );
    }
  }

  private toHttpError(error: unknown, fallback: string): HttpException {
    if (error instanceof HttpException) {
      return error;
    }
    if (error instanceof PaymentGatewayError) {
      if (error.statusCode === 400) {
        return new BadRequestException(error.message);
      }
      if (error.statusCode === 503) {
        return new ServiceUnavailableException(error.message);
      }

      return new BadGatewayException(error.message);
    }

    return new BadGatewayException(fallback);
  }

  private formatMoney(minorUnits: number, currency: string): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(minorUnits / 100);
  }
}

function gatewayMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 500);
  }

  return 'The payment gateway reported an error';
}

function webhookReference(payload: GatewayWebhookPayload): string | undefined {
  return (
    payload.payload?.payment?.entity?.id ??
    payload.payload?.refund?.entity?.id ??
    payload.payload?.order?.entity?.id ??
    undefined
  );
}

function orderRef(payment: PaymentRecord): string {
  return `${payment.provider} payment for ${payment.orderNumber}`;
}
