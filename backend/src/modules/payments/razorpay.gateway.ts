import { createHmac, timingSafeEqual } from 'node:crypto';
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

export interface RazorpayGatewayOptions {
  /** `rzp_test_…` or `rzp_live_…`. Public, safe to hand to the browser. */
  keyId: string;
  /** Server-only signing secret. Never logged, never returned by any endpoint. */
  keySecret: string;
  /** Server-only webhook signing secret. */
  webhookSecret: string;
  /** Overridable for tests/proxies; defaults to the production API. */
  baseUrl?: string;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'https://api.razorpay.com/v1';
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Razorpay gateway adapter — plain `fetch` + `node:crypto`, no SDK.
 *
 * Why not the official package: it is CommonJS in an ESM codebase, and the four
 * calls this store needs (create order, fetch payment, refund, verify signature)
 * are a dozen lines of HTTP. Avoiding the dependency also keeps the HMAC maths
 * explicit and unit-testable.
 *
 * Security rules enforced here:
 *  - the key secret only ever goes into an `Authorization` header;
 *  - no secret, no full gateway payload and no header is logged or thrown;
 *  - signature comparison is `timingSafeEqual` over equal-length buffers.
 */
export class RazorpayGateway implements PaymentGateway {
  readonly descriptor: GatewayDescriptor;

  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: RazorpayGatewayOptions) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.descriptor = {
      provider: 'razorpay',
      enabled: true,
      testMode: options.keyId.startsWith('rzp_test_'),
      publicKeyId: options.keyId,
      webhooksEnabled: true,
    };
  }

  async createOrder(input: CreateGatewayOrderInput): Promise<GatewayOrder> {
    const body = await this.request<{
      id: string;
      amount: number;
      currency: string;
      receipt?: string;
      status?: string;
    }>('POST', '/orders', {
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes,
    });

    return {
      id: String(body.id),
      amount: Number(body.amount ?? input.amount),
      currency: String(body.currency ?? input.currency),
      receipt: body.receipt,
      status: String(body.status ?? 'created'),
    };
  }

  async fetchPayment(gatewayPaymentId: string): Promise<GatewayPayment> {
    const body = await this.request<{
      id: string;
      order_id?: string | null;
      amount: number;
      currency: string;
      status: string;
      method?: string;
      captured?: boolean;
    }>('GET', `/payments/${encodeURIComponent(gatewayPaymentId)}`);

    return {
      id: String(body.id),
      orderId: body.order_id ? String(body.order_id) : null,
      amount: Number(body.amount ?? 0),
      currency: String(body.currency ?? 'INR'),
      status: String(body.status ?? 'created'),
      method: String(body.method ?? 'unknown'),
      captured: Boolean(body.captured),
    };
  }

  async refund(input: CreateGatewayRefundInput): Promise<GatewayRefund> {
    const body = await this.request<{
      id: string;
      payment_id: string;
      amount: number;
      status?: string;
    }>('POST', `/payments/${encodeURIComponent(input.gatewayPaymentId)}/refund`, {
      amount: input.amount,
      speed: 'normal',
      receipt: input.receipt,
      notes: input.notes,
    });

    return {
      id: String(body.id),
      gatewayPaymentId: String(body.payment_id ?? input.gatewayPaymentId),
      amount: Number(body.amount ?? input.amount),
      status: body.status === 'processed' ? 'processed' : body.status === 'failed' ? 'failed' : 'pending',
    };
  }

  verifyCheckoutSignature(input: VerifyCheckoutInput): boolean {
    const expected = createHmac('sha256', this.options.keySecret)
      .update(`${input.gatewayOrderId}|${input.gatewayPaymentId}`)
      .digest('hex');

    return safeEqual(expected, input.signature);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const expected = createHmac('sha256', this.options.webhookSecret)
      .update(rawBody)
      .digest('hex');

    return safeEqual(expected, signature);
  }

  /** Single place where HTTP, auth, timeouts and error messages are handled. */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.options.keyId}:${this.options.keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      // Network error / timeout: message deliberately excludes the URL credentials.
      throw new PaymentGatewayError(
        'The payment gateway could not be reached — please try again',
        502,
      );
    }

    const text = await response.text();
    let parsed: unknown = null;

    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const description =
        typeof parsed === 'object' && parsed !== null
          ? ((parsed as { error?: { description?: string } }).error?.description ?? '')
          : '';

      // The gateway's own description is safe to show; nothing else is echoed.
      throw new PaymentGatewayError(
        description
          ? `The payment gateway rejected the request: ${description}`
          : 'The payment gateway rejected the request',
        response.status === 400 ? 400 : 502,
      );
    }

    return (parsed ?? {}) as T;
  }
}

/**
 * Constant-time string comparison that also tolerates different lengths.
 *
 * `timingSafeEqual` throws on length mismatch, and comparing lengths first is
 * itself a (harmless, but real) timing leak — this keeps both cases safe.
 */
function safeEqual(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    // Still do a comparison of equal-length buffers so the failure is not faster.
    timingSafeEqual(expectedBuffer, expectedBuffer);

    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
