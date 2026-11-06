// src/modules/checkout/checkout.service.spec.ts

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { Role } from '../../common/enums/role.enum.js';
import { CheckoutService } from './checkout.service.js';
import { CartService } from '../cart/cart.service.js';
import type {
  CartTotalsView,
  CheckoutCartLine,
  CheckoutCartSnapshot,
} from '../cart/cart.service.js';
import { AddressesService } from '../addresses/addresses.service.js';
import type { AddressRecord } from '../addresses/repositories/addresses.repository.js';
import { OrdersService } from '../orders/orders.service.js';
import type { CreateOrderResult, OrderView } from '../orders/orders.service.js';
import type { CreateOrderDto } from '../orders/dto/create-order.dto.js';
import { PaymentsService } from '../payments/payments.service.js';
import type { CheckoutSessionView, VerifyPaymentView } from '../payments/payments.service.js';
import { SettingsService } from '../settings/settings.service.js';

const USER: AuthenticatedUser = {
  id: 'user-1',
  email: 'asha@example.com',
  role: Role.Customer,
};

const ADDRESS: AddressRecord = {
  id: 'addr-1',
  userId: USER.id,
  label: 'Home',
  recipientName: 'Asha Rao',
  phone: '+91 98765 43210',
  line1: '12 Market Road',
  line2: 'Near the temple',
  city: 'Coimbatore',
  state: 'Tamil Nadu',
  postalCode: '641001',
  country: 'India',
  isDefault: true,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
};

const TOTALS: CartTotalsView = {
  itemCount: 1,
  subtotal: 1_20_000,
  goodsValue: 1_20_000,
  discountTotal: 0,
  couponDiscount: 0,
  shippingCharge: 0,
  taxAmount: 21_600,
  taxRatePercent: 18,
  total: 1_41_600,
  currency: 'INR',
  freeShippingThreshold: 99_900,
  freeShippingGap: 0,
};

const LINE: CheckoutCartLine = {
  productId: 'p1',
  name: 'Steel Kettle',
  slug: 'steel-kettle',
  sku: 'KET-1',
  imageUrl: 'https://cdn.example.com/kettle.jpg',
  quantity: 1,
  unitPrice: 1_20_000,
  listPrice: 1_20_000,
  lineTotal: 1_20_000,
};

function snapshot(overrides: Partial<CheckoutCartSnapshot> = {}): CheckoutCartSnapshot {
  return {
    items: [LINE],
    totals: TOTALS,
    coupon: null,
    couponCode: null,
    couponIssue: null,
    problems: [],
    ...overrides,
  };
}

function order(overrides: Partial<OrderView> = {}): OrderView {
  return {
    id: 'order-1',
    orderNumber: 'ORD-1001',
    status: 'pending',
    paymentStatus: 'pending',
    total: 1_41_600,
    ...overrides,
  } as unknown as OrderView;
}

function session(overrides: Partial<CheckoutSessionView> = {}): CheckoutSessionView {
  return {
    paymentId: 'pay-1',
    orderId: 'order-1',
    orderNumber: 'ORD-1001',
    amount: 1_41_600,
    currency: 'INR',
    provider: 'razorpay',
    keyId: 'rzp_test_key',
    testMode: true,
    gatewayOrderId: 'order_RZP1',
    status: 'created',
    prefill: { name: 'Asha Rao', email: USER.email },
    notes: {},
    ...overrides,
  };
}

describe('CheckoutService', () => {
  let cart: {
    checkoutSnapshot: ReturnType<typeof vi.fn>;
    clearAfterOrder: ReturnType<typeof vi.fn>;
  };
  let addresses: { requireOwned: ReturnType<typeof vi.fn> };
  let orders: {
    createForCustomer: ReturnType<typeof vi.fn>;
    confirmPlacement: ReturnType<typeof vi.fn>;
  };
  let payments: {
    checkoutConfig: ReturnType<typeof vi.fn>;
    createPaymentOrder: ReturnType<typeof vi.fn>;
    verifyPayment: ReturnType<typeof vi.fn>;
  };
  let settings: { codPolicy: ReturnType<typeof vi.fn> };
  let service: CheckoutService;

  beforeEach(() => {
    cart = {
      checkoutSnapshot: vi.fn(async () => snapshot()),
      clearAfterOrder: vi.fn(async () => undefined),
    };
    addresses = { requireOwned: vi.fn(async () => ADDRESS) };
    orders = {
      createForCustomer: vi.fn(
        async (): Promise<CreateOrderResult> => ({ order: order(), created: true }),
      ),
      // Confirming a COD order is the orders module's job; here it just reports it.
      confirmPlacement: vi.fn(async (id: string) => order({ id, status: 'confirmed' })),
    };
    payments = {
      checkoutConfig: vi.fn(() => ({
        provider: 'razorpay',
        enabled: true,
        testMode: true,
        keyId: 'rzp_test_key',
        currency: 'INR',
        webhooksEnabled: false,
      })),
      createPaymentOrder: vi.fn(async () => session()),
      verifyPayment: vi.fn(),
    };
    settings = { codPolicy: vi.fn(async () => ({ enabled: true, maxAmount: 0, currency: 'INR' })) };

    service = new CheckoutService(
      cart as unknown as CartService,
      addresses as unknown as AddressesService,
      orders as unknown as OrdersService,
      payments as unknown as PaymentsService,
      settings as unknown as SettingsService,
    );
  });

  // ------------------------------------------------------------------ preview

  it('prices the cart without writing anything', async () => {
    const preview = await service.preview(USER, {
      addressId: ADDRESS.id,
      paymentMethod: 'online',
    });

    expect(addresses.requireOwned).toHaveBeenCalledWith(USER.id, ADDRESS.id);
    expect(preview.items).toEqual([LINE]);
    expect(preview.totals.total).toBe(1_41_600);
    expect(preview.address).toMatchObject({ id: ADDRESS.id, city: 'Coimbatore' });
    expect(preview.paymentOptions).toMatchObject({
      codAvailable: true,
      onlineAvailable: true,
      currency: 'INR',
    });
    expect(preview.shippingMethod).toBe('standard');
    expect(Number.isNaN(Date.parse(preview.estimatedDelivery))).toBe(false);
    expect(orders.createForCustomer).not.toHaveBeenCalled();
    expect(cart.clearAfterOrder).not.toHaveBeenCalled();
  });

  it('refuses somebody else’s address (404 from the address book)', async () => {
    addresses.requireOwned.mockRejectedValueOnce(new NotFoundException('Address not found'));

    await expect(
      service.preview(USER, { addressId: 'addr-other', paymentMethod: 'cod' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses an empty cart', async () => {
    cart.checkoutSnapshot.mockResolvedValueOnce(snapshot({ items: [] }));

    await expect(
      service.preview(USER, { addressId: ADDRESS.id, paymentMethod: 'online' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('names the items whose stock disappeared', async () => {
    cart.checkoutSnapshot.mockResolvedValueOnce(
      snapshot({ problems: ['"Copper Mug": only 2 left in stock'], items: [] }),
    );

    await expect(
      service.preview(USER, { addressId: ADDRESS.id, paymentMethod: 'online' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: expect.stringContaining('Copper Mug') as unknown as string,
      }),
    });
  });

  it('refuses a coupon that expired after it was applied', async () => {
    cart.checkoutSnapshot.mockResolvedValueOnce(
      snapshot({ couponIssue: 'This coupon has expired', couponCode: null }),
    );

    await expect(
      service.place(USER, { addressId: ADDRESS.id, paymentMethod: 'online' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses cash on delivery when the operator switched it off', async () => {
    settings.codPolicy.mockResolvedValueOnce({ enabled: false, maxAmount: 0, currency: 'INR' });

    await expect(
      service.preview(USER, { addressId: ADDRESS.id, paymentMethod: 'cod' }),
    ).rejects.toThrow(/cash on delivery is currently unavailable/i);
  });

  it('refuses cash on delivery above the configured limit', async () => {
    settings.codPolicy.mockResolvedValueOnce({
      enabled: true,
      maxAmount: 1_00_000,
      currency: 'INR',
    });

    await expect(
      service.place(USER, { addressId: ADDRESS.id, paymentMethod: 'cod' }),
    ).rejects.toThrow(/up to ₹1,000/);
    expect(orders.createForCustomer).not.toHaveBeenCalled();
  });

  it('refuses online payment when the gateway is disabled', async () => {
    payments.checkoutConfig.mockReturnValueOnce({
      provider: 'disabled',
      enabled: false,
      testMode: false,
      keyId: null,
      currency: 'INR',
      webhooksEnabled: false,
    });

    await expect(
      service.preview(USER, { addressId: ADDRESS.id, paymentMethod: 'online' }),
    ).rejects.toThrow(/online payment is temporarily unavailable/i);
  });

  // -------------------------------------------------------------------- place

  it('places a COD order, clears the cart and needs no gateway', async () => {
    orders.createForCustomer.mockResolvedValueOnce({
      order: order({ status: 'confirmed', paymentStatus: 'pending' }),
      created: true,
    });

    const placed = await service.place(USER, {
      addressId: ADDRESS.id,
      paymentMethod: 'cod',
      customerNote: '  Leave at the gate  ',
    });

    const dto = orders.createForCustomer.mock.calls[0][1] as CreateOrderDto;

    expect(dto).toMatchObject({
      items: [{ productId: 'p1', quantity: 1 }],
      paymentMethod: 'cod',
      shippingMethod: 'standard',
      customerNote: 'Leave at the gate',
      shippingAddress: {
        recipientName: 'Asha Rao',
        line1: '12 Market Road',
        line2: 'Near the temple',
        postalCode: '641001',
      },
    });
    expect(dto).not.toHaveProperty('couponCode');
    expect(placed).toMatchObject({
      orderId: 'order-1',
      orderNumber: 'ORD-1001',
      paymentMethod: 'cod',
      status: 'confirmed',
      requiresPayment: false,
      payment: null,
      created: true,
    });
    expect(cart.clearAfterOrder).toHaveBeenCalledWith(USER.id);
    expect(payments.createPaymentOrder).not.toHaveBeenCalled();
  });

  it('places an online order as `card` and hands back the gateway session', async () => {
    const placed = await service.place(USER, {
      addressId: ADDRESS.id,
      paymentMethod: 'online',
      idempotencyKey: 'checkout-abc',
    });

    expect(orders.createForCustomer.mock.calls[0][1]).toMatchObject({
      paymentMethod: 'card',
      idempotencyKey: 'checkout-abc',
    });
    expect(payments.createPaymentOrder).toHaveBeenCalledWith(USER, { orderId: 'order-1' });
    expect(placed).toMatchObject({
      requiresPayment: true,
      paymentUrl: '/account/orders/order-1',
      payment: {
        gatewayOrderId: 'order_RZP1',
        amount: 1_41_600,
        keyId: 'rzp_test_key',
      },
    });
  });

  it('forwards the validated coupon code to the order', async () => {
    cart.checkoutSnapshot.mockResolvedValueOnce(
      snapshot({
        couponCode: 'SAVE10',
        coupon: {
          code: 'SAVE10',
          name: 'Save 10',
          type: 'percentage',
          summary: '10% off',
          discount: 5_000,
          freeShipping: false,
        },
      }),
    );

    await service.place(USER, { addressId: ADDRESS.id, paymentMethod: 'cod' });

    expect(orders.createForCustomer.mock.calls[0][1]).toMatchObject({ couponCode: 'SAVE10' });
  });

  it('does not clear the cart when an idempotent retry returned an existing order', async () => {
    orders.createForCustomer.mockResolvedValueOnce({ order: order(), created: false });

    const placed = await service.place(USER, {
      addressId: ADDRESS.id,
      paymentMethod: 'cod',
      idempotencyKey: 'checkout-abc',
    });

    expect(placed.created).toBe(false);
    expect(cart.clearAfterOrder).not.toHaveBeenCalled();
  });

  it('surfaces a stock race as a 409 from the order module', async () => {
    orders.createForCustomer.mockRejectedValueOnce(
      new ConflictException('Only 1 unit of "Steel Kettle" is available'),
    );

    await expect(
      service.place(USER, { addressId: ADDRESS.id, paymentMethod: 'online' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(cart.clearAfterOrder).not.toHaveBeenCalled();
    expect(payments.createPaymentOrder).not.toHaveBeenCalled();
  });

  it('keeps the order when the gateway refuses to open an attempt', async () => {
    payments.createPaymentOrder.mockRejectedValueOnce(new Error('gateway down'));

    await expect(
      service.place(USER, { addressId: ADDRESS.id, paymentMethod: 'online' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    // The order exists and is payable later; only clearing must have happened.
    expect(cart.clearAfterOrder).toHaveBeenCalledWith(USER.id);
  });

  it('does not fail the order when clearing the cart fails', async () => {
    cart.clearAfterOrder.mockRejectedValueOnce(new Error('mongo hiccup'));

    const placed = await service.place(USER, {
      addressId: ADDRESS.id,
      paymentMethod: 'cod',
    });

    expect(placed.orderNumber).toBe('ORD-1001');
  });

  // ------------------------------------------------------------- verification

  it('confirms a payment and reports the order it belongs to', async () => {
    payments.verifyPayment.mockResolvedValueOnce({
      verified: true,
      status: 'captured',
      statusLabel: 'Paid',
      payment: {
        id: 'pay-1',
        orderId: 'order-1',
        orderNumber: 'ORD-1001',
        amount: 1_41_600,
        currency: 'INR',
        status: 'captured',
      },
      order: { id: 'order-1', orderNumber: 'ORD-1001', status: 'confirmed', paymentStatus: 'paid' },
    } as unknown as VerifyPaymentView);

    const result = await service.confirmPayment(USER, {
      gatewayOrderId: 'order_RZP1',
      gatewayPaymentId: 'pay_RZP1',
      signature: 'a'.repeat(64),
    });

    expect(result).toMatchObject({
      verified: true,
      orderId: 'order-1',
      orderNumber: 'ORD-1001',
      orderStatus: 'confirmed',
      total: 1_41_600,
    });
  });

  it('turns an unverifiable signature into a 422', async () => {
    payments.verifyPayment.mockRejectedValueOnce(
      new BadRequestException('The payment signature could not be verified'),
    );

    await expect(
      service.confirmPayment(USER, {
        gatewayOrderId: 'order_RZP1',
        gatewayPaymentId: 'pay_RZP1',
        signature: 'b'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('leaves unrelated payment errors untouched', async () => {
    payments.verifyPayment.mockRejectedValueOnce(new ConflictException('Already paid'));

    await expect(
      service.confirmPayment(USER, {
        gatewayOrderId: 'order_RZP1',
        gatewayPaymentId: 'pay_RZP1',
        signature: 'c'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
