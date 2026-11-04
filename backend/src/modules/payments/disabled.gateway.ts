import { PaymentGatewayError } from './payment-gateway.js';
import type {
  CreateGatewayOrderInput,
  CreateGatewayRefundInput,
  GatewayDescriptor,
  GatewayOrder,
  GatewayPayment,
  GatewayRefund,
  PaymentGateway,
  VerifyCheckoutInput,
} from './payment-gateway.js';

/**
 * Used when no gateway credentials are configured.
 *
 * The store still boots and every admin payment view keeps working — only the
 * actions that need Razorpay answer 503 with an actionable message, which is far
 * better than a checkout that opens and then fails every verification.
 */
export class DisabledPaymentGateway implements PaymentGateway {
  readonly descriptor: GatewayDescriptor = {
    provider: 'disabled',
    enabled: false,
    testMode: false,
    publicKeyId: null,
    webhooksEnabled: false,
  };

  private readonly message =
    'Online payments are not configured on this server (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET)';

  async createOrder(_input: CreateGatewayOrderInput): Promise<GatewayOrder> {
    throw new PaymentGatewayError(this.message, 503);
  }

  async fetchPayment(_gatewayPaymentId: string): Promise<GatewayPayment> {
    throw new PaymentGatewayError(this.message, 503);
  }

  async refund(_input: CreateGatewayRefundInput): Promise<GatewayRefund> {
    throw new PaymentGatewayError(this.message, 503);
  }

  verifyCheckoutSignature(_input: VerifyCheckoutInput): boolean {
    return false;
  }

  verifyWebhookSignature(_rawBody: Buffer, _signature: string): boolean {
    return false;
  }
}
