import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RazorpayGateway } from './razorpay.gateway.js';
import { PaymentGatewayError } from './payment-gateway.js';

const KEY_ID = 'rzp_test_1234567890';
const KEY_SECRET = 'key-secret-value';
const WEBHOOK_SECRET = 'webhook-secret-value';

function gateway() {
  return new RazorpayGateway({
    keyId: KEY_ID,
    keySecret: KEY_SECRET,
    webhookSecret: WEBHOOK_SECRET,
    baseUrl: 'https://api.razorpay.test/v1',
  });
}

const sign = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(payload).digest('hex');

describe('RazorpayGateway', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('descriptor', () => {
    it('marks test keys as test mode and exposes only the public key', () => {
      expect(gateway().descriptor).toEqual({
        provider: 'razorpay',
        enabled: true,
        testMode: true,
        publicKeyId: KEY_ID,
        webhooksEnabled: true,
      });
    });

    it('marks live keys as live', () => {
      const live = new RazorpayGateway({
        keyId: 'rzp_live_abcdef',
        keySecret: KEY_SECRET,
        webhookSecret: WEBHOOK_SECRET,
      });

      expect(live.descriptor.testMode).toBe(false);
    });
  });

  describe('verification', () => {
    it('accepts the checkout signature the gateway would produce', () => {
      const signature = sign(`${'order_1'}|${'pay_1'}`, KEY_SECRET);

      expect(
        gateway().verifyCheckoutSignature({
          gatewayOrderId: 'order_1',
          gatewayPaymentId: 'pay_1',
          signature,
        }),
      ).toBe(true);
    });

    it('rejects a forged or wrong-length checkout signature', () => {
      expect(
        gateway().verifyCheckoutSignature({
          gatewayOrderId: 'order_1',
          gatewayPaymentId: 'pay_1',
          signature: 'deadbeef',
        }),
      ).toBe(false);
    });

    it('verifies the webhook HMAC over the raw bytes only', () => {
      const body = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
      const signature = sign(body.toString('utf8'), WEBHOOK_SECRET);

      expect(gateway().verifyWebhookSignature(body, signature)).toBe(true);
      // A re-serialised body is different bytes, therefore a different signature.
      const reserialised = Buffer.from(
        JSON.stringify({ event: 'payment.captured' }, null, 2),
      );

      expect(gateway().verifyWebhookSignature(reserialised, signature)).toBe(false);
    });
  });

  describe('API calls', () => {
    it('creates an order with basic auth and the minor-unit amount', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'order_abc',
            amount: 100_000,
            currency: 'INR',
            status: 'created',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      vi.stubGlobal('fetch', fetchMock);

      const order = await gateway().createOrder({
        amount: 100_000,
        currency: 'INR',
        receipt: 'ORD-20260101-0001',
        notes: { orderNumber: 'ORD-20260101-0001' },
      });

      expect(order).toMatchObject({ id: 'order_abc', amount: 100_000, status: 'created' });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.razorpay.test/v1/orders');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`,
      );
      expect(JSON.parse(String(init.body))).toMatchObject({ amount: 100_000, currency: 'INR' });
    });

    it('maps a gateway error to a safe message that never leaks the secret', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({ error: { description: 'Payment not found' } }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      );

      const failure = gateway().fetchPayment('pay_missing');

      await expect(failure).rejects.toBeInstanceOf(PaymentGatewayError);
      await expect(failure).rejects.toThrow('Payment not found');
      await expect(failure).rejects.not.toThrow(new RegExp(KEY_SECRET));
    });

    it('reports an unreachable gateway without echoing credentials', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      await expect(
        gateway().createOrder({
          amount: 1_000,
          currency: 'INR',
          receipt: 'ORD-1',
          notes: {},
        }),
      ).rejects.toThrow('The payment gateway could not be reached');
    });

    it('refunds the gateway payment and reports the gateway refund id', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              id: 'rfnd_abc',
              payment_id: 'pay_abc',
              amount: 40_000,
              status: 'processed',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      );

      const refund = await gateway().refund({
        gatewayPaymentId: 'pay_abc',
        amount: 40_000,
        receipt: 'refund-uuid',
        notes: {},
      });

      expect(refund).toMatchObject({
        id: 'rfnd_abc',
        gatewayPaymentId: 'pay_abc',
        amount: 40_000,
        status: 'processed',
      });
    });
  });
});
