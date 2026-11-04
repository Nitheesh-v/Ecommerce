import { createHmac } from 'node:crypto';
import { PaymentGatewayError } from '../../src/modules/payments/payment-gateway.js';
import type {
  CreateGatewayOrderInput,
  CreateGatewayRefundInput,
  GatewayDescriptor,
  GatewayOrder,
  GatewayPayment,
  GatewayRefund,
  PaymentGateway,
  VerifyCheckoutInput,
} from '../../src/modules/payments/payment-gateway.js';

const CHECKOUT_SECRET = 'test-checkout-secret';
const WEBHOOK_SECRET = 'test-webhook-secret';

/**
 * Deterministic payment gateway for e2e tests.
 *
 * It performs the **real** HMAC verification (same algorithm as Razorpay) over a
 * test secret, so signature tests exercise production code paths, while order and
 * payment ids are predictable and no network call is made.
 */
export class FakePaymentGateway implements PaymentGateway {
  readonly descriptor: GatewayDescriptor = {
    provider: 'razorpay',
    enabled: true,
    testMode: true,
    publicKeyId: 'rzp_test_fake_key',
    webhooksEnabled: true,
  };

  private orderSequence = 0;
  private refundSequence = 0;
  private readonly payments = new Map<string, GatewayPayment>();
  /** When set, the next gateway call throws this (failure-path tests). */
  failNext: 'createOrder' | 'fetchPayment' | 'refund' | null = null;
  refundStatus: GatewayRefund['status'] = 'processed';

  async createOrder(input: CreateGatewayOrderInput): Promise<GatewayOrder> {
    this.throwIfArmed('createOrder');
    this.orderSequence += 1;

    return {
      id: `order_test_${String(this.orderSequence).padStart(6, '0')}`,
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
      status: 'created',
    };
  }

  async fetchPayment(gatewayPaymentId: string): Promise<GatewayPayment> {
    this.throwIfArmed('fetchPayment');

    const payment = this.payments.get(gatewayPaymentId);

    if (!payment) {
      throw new PaymentGatewayError('The payment could not be found at the gateway', 400);
    }

    return { ...payment };
  }

  async refund(input: CreateGatewayRefundInput): Promise<GatewayRefund> {
    this.throwIfArmed('refund');
    this.refundSequence += 1;

    return {
      id: `rfnd_test_${String(this.refundSequence).padStart(6, '0')}`,
      gatewayPaymentId: input.gatewayPaymentId,
      amount: input.amount,
      status: this.refundStatus,
    };
  }

  verifyCheckoutSignature(input: VerifyCheckoutInput): boolean {
    const expected = createHmac('sha256', CHECKOUT_SECRET)
      .update(`${input.gatewayOrderId}|${input.gatewayPaymentId}`)
      .digest('hex');

    return expected === input.signature;
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const expected = createHmac('sha256', WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    return expected === signature;
  }

  // ---------------------------------------------------------- test helpers

  /** Registers a payment as the gateway would report it after checkout. */
  registerPayment(
    payment: Omit<GatewayPayment, 'captured'> & { captured?: boolean },
  ): GatewayPayment {
    const stored: GatewayPayment = {
      ...payment,
      captured: payment.captured ?? payment.status === 'captured',
    };

    this.payments.set(stored.id, stored);

    return { ...stored };
  }

  signCheckout(gatewayOrderId: string, gatewayPaymentId: string): string {
    return createHmac('sha256', CHECKOUT_SECRET)
      .update(`${gatewayOrderId}|${gatewayPaymentId}`)
      .digest('hex');
  }

  signWebhook(rawBody: string | Buffer): string {
    return createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  }

  reset(): void {
    this.orderSequence = 0;
    this.refundSequence = 0;
    this.payments.clear();
    this.failNext = null;
    this.refundStatus = 'processed';
  }

  private throwIfArmed(operation: 'createOrder' | 'fetchPayment' | 'refund'): void {
    if (this.failNext === operation) {
      this.failNext = null;

      throw new PaymentGatewayError('The payment gateway is temporarily unavailable', 502);
    }
  }
}
