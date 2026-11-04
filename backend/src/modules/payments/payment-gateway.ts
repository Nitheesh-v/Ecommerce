/**
 * The seam between the application and a payment provider.
 *
 * Everything the rest of the codebase knows about Razorpay lives behind this
 * interface, so the service layer can be exercised against a deterministic fake
 * in tests and the console keeps working on a deployment with no gateway
 * configured (checkout answers 503, admin views still render).
 *
 * Two rules the interface encodes:
 *  1. Nothing here accepts or returns card data — only ids, amounts and statuses.
 *  2. Verification is a *server* decision: signatures are checked with a secret
 *     that never leaves the backend.
 */

/** DI token (a value import, so Nest can resolve it at runtime). */
export const PAYMENT_GATEWAY = 'PAYMENT_GATEWAY';

export interface GatewayDescriptor {
  readonly provider: 'razorpay' | 'disabled';
  /** `false` when no credentials are configured: checkout must not be offered. */
  readonly enabled: boolean;
  /** `true` for `rzp_test_…` keys, surfaced so the console can label the data. */
  readonly testMode: boolean;
  /** Public key id handed to the checkout widget. Never the secret. */
  readonly publicKeyId: string | null;
  readonly webhooksEnabled: boolean;
}

export interface CreateGatewayOrderInput {
  /** Minor units (paise). */
  amount: number;
  currency: string;
  /** Our order number — the gateway receipt, for reconciliation. */
  receipt: string;
  notes: Record<string, string>;
}

export interface GatewayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
}

export interface GatewayPayment {
  id: string;
  orderId: string | null;
  amount: number;
  currency: string;
  /** `created`, `authorized`, `captured`, `failed`… */
  status: string;
  /** `card`, `upi`, `netbanking`, `wallet`… — an id-free label only. */
  method: string;
  captured: boolean;
}

export interface CreateGatewayRefundInput {
  gatewayPaymentId: string;
  /** Minor units. */
  amount: number;
  /** Our refund id — makes a retried refund attributable to one obligation. */
  receipt: string;
  notes: Record<string, string>;
}

export interface GatewayRefund {
  id: string;
  gatewayPaymentId: string;
  amount: number;
  status: 'pending' | 'processed' | 'failed';
}

export interface VerifyCheckoutInput {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  signature: string;
}

export interface PaymentGateway {
  readonly descriptor: GatewayDescriptor;
  createOrder(input: CreateGatewayOrderInput): Promise<GatewayOrder>;
  fetchPayment(gatewayPaymentId: string): Promise<GatewayPayment>;
  refund(input: CreateGatewayRefundInput): Promise<GatewayRefund>;
  /** `HMAC_SHA256("<order_id>|<payment_id>", key_secret)` from the checkout. */
  verifyCheckoutSignature(input: VerifyCheckoutInput): boolean;
  /** `HMAC_SHA256(raw_body, webhook_secret)` from the webhook request. */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
}

/** A gateway failure with an HTTP status the API can surface safely. */
export class PaymentGatewayError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 502,
  ) {
    super(message);
    this.name = 'PaymentGatewayError';
  }
}
