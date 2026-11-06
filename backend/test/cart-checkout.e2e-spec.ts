// test/cart-checkout.e2e-spec.ts

import type { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { Role } from '../src/common/enums/role.enum.js';
import { createTestApp } from './support/create-test-app.js';
import { FakeImageStorage } from './support/fake-image-storage.js';
import { FakePaymentGateway } from './support/fake-payment-gateway.js';
import { HardeningTestModule } from './support/hardening-test.module.js';
import { InMemoryAddressesRepository } from './support/in-memory-addresses.repository.js';
import { InMemoryCartsRepository } from './support/in-memory-carts.repository.js';
import { InMemoryCategoriesRepository } from './support/in-memory-categories.repository.js';
import { InMemoryCustomersRepository } from './support/in-memory-customers.repository.js';
import { InMemoryInventoryRepository } from './support/in-memory-inventory.repository.js';
import { InMemoryOffersRepository } from './support/in-memory-offers.repository.js';
import { InMemoryOrdersRepository } from './support/in-memory-orders.repository.js';
import { InMemoryPaymentEventsRepository } from './support/in-memory-payment-events.repository.js';
import { InMemoryPaymentsRepository } from './support/in-memory-payments.repository.js';
import { InMemoryProductsRepository } from './support/in-memory-products.repository.js';
import type { CreateProductInput } from '../src/modules/products/repositories/products.repository.js';
import { InMemoryRedemptionsRepository } from './support/in-memory-redemptions.repository.js';
import { InMemorySessionsRepository } from './support/in-memory-sessions.repository.js';
import { InMemorySettingsRepository } from './support/in-memory-settings.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
  process.env.JWT_ACCESS_SECRET = 'integration-test-secret-value-32-chars-min';
  process.env.BCRYPT_ROUNDS = '4';
  // One suite adds and removes a lot of cart lines from a single IP.
  process.env.THROTTLE_LIMIT = '10000';
});

const ADMIN = { email: 'owner@example.com', password: 'Adm1nPassw0rd' };
const ASHA = { email: 'asha@example.com', password: 'Str0ngPassw0rd' };

const AUDIO_ID = '64b7f1c2a1b2c3d4e5f60001';

const ADDRESS = {
  label: 'Home',
  recipientName: 'Asha Rao',
  phone: '+91 90000 00001',
  line1: '12 Market Road',
  city: 'Coimbatore',
  state: 'Tamil Nadu',
  postalCode: '641001',
  country: 'India',
};

/** ₹1,999 sale / ₹2,499 list, comfortably above the ₹999 free-shipping threshold. */
const HEADPHONES: CreateProductInput = {
  name: 'Wireless Headphones',
  slug: 'wireless-headphones',
  description: 'Studio-grade wireless headphones.',
  sku: 'SKU-AU-1001',
  categoryId: AUDIO_ID,
  price: 249_900,
  salePrice: 199_900,
  costPrice: 150_000,
  stock: 10,
  lowStockThreshold: 3,
  status: 'published',
  isFeatured: false,
  images: [{ url: 'https://cdn.example.com/headphones.jpg' }],
};

describe('Cart & checkout (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let ashaToken: string;
  let products: InMemoryProductsRepository;
  let orders: InMemoryOrdersRepository;
  let payments: InMemoryPaymentsRepository;
  let offers: InMemoryOffersRepository;
  let redemptions: InMemoryRedemptionsRepository;
  let gateway: FakePaymentGateway;
  let addresses: InMemoryAddressesRepository;
  let carts: InMemoryCartsRepository;
  let settings: InMemorySettingsRepository;
  let headphonesId: string;
  let cheapId: string;
  let addressId: string;

  const server = () => app.getHttpServer();

  const asAsha = (method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${ashaToken}`);

  const asAdmin = (method: 'get' | 'post' | 'patch', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${adminToken}`);

  async function login(email: string, password: string): Promise<string> {
    const response = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.data.accessToken as string;
  }

  function addToCart(productId: string, quantity = 1) {
    return asAsha('post', '/api/cart/items').send({ productId, quantity });
  }

  function preview(paymentMethod: 'cod' | 'online' = 'cod') {
    return asAsha('post', '/api/checkout/preview').send({ addressId, paymentMethod });
  }

  function place(paymentMethod: 'cod' | 'online' = 'cod', extra: object = {}) {
    return asAsha('post', '/api/checkout/place').send({
      addressId,
      paymentMethod,
      ...extra,
    });
  }

  beforeAll(async () => {
    const users = new InMemoryUsersRepository();
    const sessions = new InMemorySessionsRepository();

    users.seed({
      email: ADMIN.email,
      passwordHash: await bcrypt.hash(ADMIN.password, 4),
      firstName: 'Store',
      lastName: 'Owner',
      role: Role.Admin,
      isActive: true,
    });

    users.seed({
      email: ASHA.email,
      passwordHash: await bcrypt.hash(ASHA.password, 4),
      firstName: 'Asha',
      lastName: 'Rao',
      phone: '+91 90000 00001',
      role: Role.Customer,
      isActive: true,
    });

    const categories = new InMemoryCategoriesRepository();
    categories.seed({ id: AUDIO_ID, name: 'Audio', slug: 'audio' });

    products = new InMemoryProductsRepository();
    orders = new InMemoryOrdersRepository();
    payments = new InMemoryPaymentsRepository();
    offers = new InMemoryOffersRepository();
    redemptions = new InMemoryRedemptionsRepository();
    gateway = new FakePaymentGateway();
    addresses = new InMemoryAddressesRepository();
    carts = new InMemoryCartsRepository();
    settings = new InMemorySettingsRepository();

    app = await createTestApp({
      imports: [HardeningTestModule],
      users,
      sessions,
      products,
      categories,
      inventory: new InMemoryInventoryRepository(products),
      orders,
      customers: new InMemoryCustomersRepository(users, orders),
      payments,
      paymentEvents: new InMemoryPaymentEventsRepository(),
      paymentGateway: gateway,
      offers,
      redemptions,
      addresses,
      carts,
      settings,
      imageStorage: new FakeImageStorage(),
    });

    adminToken = await login(ADMIN.email, ADMIN.password);
    ashaToken = await login(ASHA.email, ASHA.password);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    products.reset();
    orders.reset();
    payments.reset();
    offers.reset();
    redemptions.reset();
    addresses.reset();
    carts.reset();
    gateway.reset();

    headphonesId = products.seed({ ...HEADPHONES }).id;
    cheapId = products.seed({
      name: 'Cotton Tea Towel',
      slug: 'cotton-tea-towel',
      description: 'Absorbent, cheap, and small enough to need shipping.',
      sku: 'SKU-HM-2001',
      categoryId: AUDIO_ID,
      price: 40_000,
      costPrice: 20_000,
      stock: 50,
      lowStockThreshold: 5,
      status: 'published',
      isFeatured: false,
      images: [],
    }).id;

    // Every test starts with COD available and uncapped.
    await asAdmin('patch', '/api/admin/settings')
      .send({ codEnabled: true, codMaxAmount: 0 })
      .expect(200);

    const address = await asAsha('post', '/api/addresses').send(ADDRESS).expect(201);
    addressId = address.body.data.id as string;
  });

  // -------------------------------------------------------------- authorization

  describe('authorization', () => {
    it('requires a signed-in customer for the cart and checkout', async () => {
      await request(server()).get('/api/cart').expect(401);
      await request(server()).post('/api/cart/items').send({ productId: headphonesId }).expect(401);
      await request(server()).delete('/api/cart').expect(401);
      await request(server())
        .post('/api/checkout/preview')
        .send({ addressId, paymentMethod: 'cod' })
        .expect(401);
      await request(server())
        .post('/api/checkout/place')
        .send({ addressId, paymentMethod: 'cod' })
        .expect(401);
      await request(server()).post('/api/addresses').send(ADDRESS).expect(401);
    });

    it('keeps a customer out of another customer’s address', async () => {
      const otherUserAddress = addresses.seed({
        userId: 'some-other-user',
        recipientName: 'Ravi Kumar',
      });

      const response = await asAsha('post', '/api/checkout/preview')
        .send({ addressId: otherUserAddress.id, paymentMethod: 'cod' })
        .expect(404);

      expect(response.body.message).toMatch(/address not found/i);
    });
  });

  // ------------------------------------------------------------ cart lifecycle

  describe('cart lifecycle', () => {
    it('starts empty with zeroed totals', async () => {
      const response = await asAsha('get', '/api/cart').expect(200);

      expect(response.body.data).toMatchObject({
        items: [],
        coupon: null,
        couponIssue: null,
        unavailableCount: 0,
        updatedAt: null,
      });
      expect(response.body.data.totals.total).toBe(0);
    });

    it('adds, increments, updates and removes a line', async () => {
      const added = await addToCart(headphonesId, 2).expect(200);

      expect(added.body.data.items).toHaveLength(1);
      expect(added.body.data.items[0]).toMatchObject({
        productId: headphonesId,
        quantity: 2,
        unitPrice: 199_900,
        lineTotal: 399_800,
        available: true,
      });
      expect(added.body.data.totals).toMatchObject({
        itemCount: 2,
        subtotal: 499_800,
        goodsValue: 399_800,
        discountTotal: 100_000,
        shippingCharge: 0,
        taxAmount: 0,
        total: 399_800,
      });

      // Adding the same product again increments rather than duplicating the line.
      const incremented = await addToCart(headphonesId, 1).expect(200);
      expect(incremented.body.data.items).toHaveLength(1);
      expect(incremented.body.data.items[0].quantity).toBe(3);

      const updated = await asAsha('patch', `/api/cart/items/${headphonesId}`)
        .send({ quantity: 5 })
        .expect(200);
      expect(updated.body.data.items[0].quantity).toBe(5);

      // Zero is the documented way to say "remove".
      const removed = await asAsha('patch', `/api/cart/items/${headphonesId}`)
        .send({ quantity: 0 })
        .expect(200);
      expect(removed.body.data.items).toEqual([]);
      expect(removed.body.data.totals.total).toBe(0);
    });

    it('removes a line with DELETE and empties the cart with one call', async () => {
      await addToCart(headphonesId, 1).expect(200);
      await addToCart(cheapId, 2).expect(200);

      const afterDelete = await asAsha('delete', `/api/cart/items/${headphonesId}`).expect(200);
      expect(afterDelete.body.data.items.map((item: { productId: string }) => item.productId)).toEqual(
        [cheapId],
      );

      const cleared = await asAsha('delete', '/api/cart').expect(200);
      expect(cleared.body.data.items).toEqual([]);
      expect(cleared.body.data.totals.total).toBe(0);
    });

    it('404s when the line being changed is not in the cart', async () => {
      await asAsha('patch', `/api/cart/items/${headphonesId}`)
        .send({ quantity: 2 })
        .expect(404);
      await asAsha('delete', `/api/cart/items/${headphonesId}`).expect(404);
    });

    it('refuses an unpublished product and a quantity the stock cannot cover', async () => {
      const draft = products.seed({
        ...HEADPHONES,
        name: 'Draft Speaker',
        slug: 'draft-speaker',
        sku: 'SKU-DRAFT-1',
        status: 'draft',
      });

      await addToCart(draft.id, 1).expect(400);
      await addToCart(headphonesId, 11).expect(409);
      await addToCart(headphonesId, 100).expect(400);
    });

    it('charges the flat shipping fee below the free-shipping threshold', async () => {
      const cart = await addToCart(cheapId, 1).expect(200);

      // ₹400 of goods + ₹49 flat shipping, tax rate 0 in the test environment.
      expect(cart.body.data.totals).toMatchObject({
        subtotal: 40_000,
        shippingCharge: 4_900,
        total: 44_900,
        freeShippingGap: 59_900,
      });
    });

    it('keeps an out-of-stock line in the cart, flagged and excluded from the totals', async () => {
      await addToCart(headphonesId, 2).expect(200);
      products.seed({ ...HEADPHONES, id: headphonesId, stock: 0 });

      const cart = await asAsha('get', '/api/cart').expect(200);

      expect(cart.body.data.items[0]).toMatchObject({
        available: false,
        unavailableReason: 'Out of stock',
      });
      expect(cart.body.data.unavailableCount).toBe(1);
      expect(cart.body.data.totals.total).toBe(0);
    });
  });

  // ------------------------------------------------------------------- coupons

  describe('coupons', () => {
    it('applies a coupon, prices it and removes it again', async () => {
      offers.seed({ code: 'TENOFF', value: 10, maxDiscount: 5_000 });
      await addToCart(headphonesId, 1).expect(200);

      const applied = await asAsha('post', '/api/cart/coupon')
        .send({ code: 'tenoff' })
        .expect(200);

      expect(applied.body.data.coupon).toMatchObject({
        code: 'TENOFF',
        discount: 5_000,
        freeShipping: false,
      });
      expect(applied.body.data.totals).toMatchObject({
        couponDiscount: 5_000,
        total: 194_900,
      });

      const removed = await asAsha('delete', '/api/cart/coupon').expect(200);
      expect(removed.body.data.coupon).toBeNull();
      expect(removed.body.data.totals.couponDiscount).toBe(0);
    });

    it('rejects an invalid code and an empty cart', async () => {
      const empty = await asAsha('post', '/api/cart/coupon')
        .send({ code: 'TENOFF' })
        .expect(400);
      expect(empty.body.message).toMatch(/add a product/i);

      await addToCart(headphonesId, 1).expect(200);

      const unknown = await asAsha('post', '/api/cart/coupon')
        .send({ code: 'NOSUCHCODE' })
        .expect(400);
      expect(unknown.body.message).toMatch(/not valid|invalid|does not exist/i);
    });

    it('drops a coupon that expires after it was applied and says why', async () => {
      const offer = offers.seed({ code: 'TENOFF', value: 10 });
      await addToCart(headphonesId, 1).expect(200);
      await asAsha('post', '/api/cart/coupon').send({ code: 'TENOFF' }).expect(200);

      offers.seed({ ...offer, endsAt: new Date(Date.now() - 60_000) });

      const cart = await asAsha('get', '/api/cart').expect(200);

      expect(cart.body.data.coupon).toBeNull();
      expect(cart.body.data.couponIssue).toBeTruthy();
      expect(cart.body.data.totals.couponDiscount).toBe(0);

      // The stale code was dropped with the cart read, so checkout no longer sees a
      // discount to trust — it prices the order full price instead of a phantom one.
      const previewBody = await preview().expect(200);
      expect(previewBody.body.data.coupon).toBeNull();
      expect(previewBody.body.data.totals.couponDiscount).toBe(0);
    });

    it('treats a free-shipping coupon as a shipping waiver', async () => {
      offers.seed({ code: 'FREESHIP', type: 'free_shipping', value: 0 });
      await addToCart(cheapId, 1).expect(200);

      const applied = await asAsha('post', '/api/cart/coupon')
        .send({ code: 'FREESHIP' })
        .expect(200);

      expect(applied.body.data.totals).toMatchObject({
        shippingCharge: 0,
        couponDiscount: 0,
        total: 40_000,
      });
    });
  });

  // ------------------------------------------------------------------ preview

  describe('POST /api/checkout/preview', () => {
    it('prices the cart for the chosen address without creating an order', async () => {
      await addToCart(headphonesId, 2).expect(200);

      const response = await preview('cod').expect(200);

      expect(response.body.data).toMatchObject({
        paymentMethod: 'cod',
        shippingMethod: 'standard',
        address: { id: addressId, recipientName: 'Asha Rao', city: 'Coimbatore' },
        paymentOptions: { codAvailable: true, codMaxAmount: 0, onlineAvailable: true },
      });
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.totals).toMatchObject({
        itemCount: 2,
        subtotal: 499_800,
        goodsValue: 399_800,
        total: 399_800,
      });
      expect(Number.isNaN(Date.parse(response.body.data.estimatedDelivery))).toBe(false);
      expect(orders.all()).toHaveLength(0);
    });

    it('refuses an empty cart', async () => {
      const response = await preview().expect(400);
      expect(response.body.message).toMatch(/cart is empty/i);
    });

    it('refuses when a line went out of stock after it was added', async () => {
      await addToCart(headphonesId, 2).expect(200);
      products.seed({ ...HEADPHONES, id: headphonesId, stock: 1 });

      const response = await preview().expect(409);
      expect(response.body.message).toMatch(/Wireless Headphones/);
      expect(orders.all()).toHaveLength(0);
    });

    it('refuses cash on delivery when the operator switched it off', async () => {
      await addToCart(headphonesId, 1).expect(200);
      await asAdmin('patch', '/api/admin/settings').send({ codEnabled: false }).expect(200);

      const response = await preview('cod').expect(409);
      expect(response.body.message).toMatch(/cash on delivery is currently unavailable/i);

      // Online payment is still offered.
      await preview('online').expect(200);
    });

    it('refuses cash on delivery above the configured limit', async () => {
      await addToCart(headphonesId, 1).expect(200);
      await asAdmin('patch', '/api/admin/settings').send({ codMaxAmount: 100_000 }).expect(200);

      const response = await preview('cod').expect(409);
      expect(response.body.message).toMatch(/up to ₹1,000/);

      await preview('online').expect(200);
    });
  });

  // ------------------------------------------------------------- COD checkout

  describe('COD checkout', () => {
    it('places the order, reserves stock and empties the cart', async () => {
      await addToCart(headphonesId, 2).expect(200);

      const response = await place('cod', { customerNote: 'Ring the bell twice' }).expect(201);

      expect(response.body.data).toMatchObject({
        paymentMethod: 'cod',
        requiresPayment: false,
        payment: null,
        paymentUrl: expect.stringMatching(/^\/account\/orders\//) as unknown as string,
        totals: { total: 399_800, currency: 'INR' },
        created: true,
      });
      expect(response.body.data.orderNumber).toMatch(/^ORD-/);

      const order = await asAsha('get', `/api/orders/${response.body.data.orderId}`).expect(200);
      expect(order.body.data).toMatchObject({
        // COD is accepted at placement: nothing is being waited on.
        status: 'confirmed',
        paymentStatus: 'pending',
        total: 399_800,
      });
      expect(
        (order.body.data.history as Array<{ note?: string }>).some(
          (entry) => entry.note === 'Ring the bell twice',
        ),
      ).toBe(true);

      const cart = await asAsha('get', '/api/cart').expect(200);
      expect(cart.body.data.items).toEqual([]);

      const product = await request(server()).get('/api/products/wireless-headphones').expect(200);
      expect(product.body.data.stock).toBe(8);
    });

    it('applies the coupon exactly once and records the redemption', async () => {
      offers.seed({ code: 'TENOFF', value: 10, maxDiscount: 5_000 });
      await addToCart(headphonesId, 1).expect(200);
      await asAsha('post', '/api/cart/coupon').send({ code: 'TENOFF' }).expect(200);

      const response = await place('cod').expect(201);

      expect(response.body.data.totals).toMatchObject({
        couponDiscount: 5_000,
        total: 194_900,
      });

      const order = await asAsha('get', `/api/orders/${response.body.data.orderId}`).expect(200);
      expect(order.body.data).toMatchObject({
        subtotal: 249_900,
        discountTotal: 50_000,
        couponDiscount: 5_000,
        total: 194_900,
      });
      const offer = await offers.findByCode('TENOFF');
      expect(offer?.usageCount).toBe(1);
      expect(redemptions.all()).toHaveLength(1);
    });

    it('creates only one order when the same idempotency key is replayed', async () => {
      await addToCart(headphonesId, 1).expect(200);

      const first = await place('cod', { idempotencyKey: 'checkout-key-1' }).expect(201);
      await addToCart(cheapId, 1).expect(200);
      const second = await place('cod', { idempotencyKey: 'checkout-key-1' }).expect(201);

      expect(second.body.data.orderId).toBe(first.body.data.orderId);
      expect(second.body.data.created).toBe(false);
      // The replay must not wipe the cart the customer has since started filling.
      const cart = await asAsha('get', '/api/cart').expect(200);
      expect(cart.body.data.items).toHaveLength(1);
    });

    it('refuses to place an order that went out of stock between the cart and checkout', async () => {
      await addToCart(headphonesId, 5).expect(200);
      products.seed({ ...HEADPHONES, id: headphonesId, stock: 1 });

      const response = await place('cod').expect(409);
      expect(response.body.message).toMatch(/no longer available|only 1/i);
      expect(orders.all()).toHaveLength(0);
      // The refusal must not cost the customer their cart.
      const cart = await asAsha('get', '/api/cart').expect(200);
      expect(cart.body.data.items).toHaveLength(1);
    });

    it('refuses an order above the COD limit even if the client skipped the preview', async () => {
      await addToCart(headphonesId, 1).expect(200);
      await asAdmin('patch', '/api/admin/settings').send({ codMaxAmount: 100_000 }).expect(200);

      const response = await place('cod').expect(409);
      expect(response.body.message).toMatch(/up to ₹1,000/);
      expect(orders.all()).toHaveLength(0);
    });

    it('refuses an address that does not exist', async () => {
      await addToCart(headphonesId, 1).expect(200);

      const response = await asAsha('post', '/api/checkout/place')
        .send({ addressId: '64b7f1c2a1b2c3d4e5f69999', paymentMethod: 'cod' })
        .expect(404);

      expect(response.body.message).toMatch(/address not found/i);
    });
  });

  // -------------------------------------------------------- online checkout

  describe('online checkout', () => {
    it('places the order and hands back a gateway order to pay against', async () => {
      await addToCart(headphonesId, 1).expect(200);

      const response = await place('online').expect(201);

      expect(response.body.data).toMatchObject({
        paymentMethod: 'online',
        requiresPayment: true,
        totals: { total: 199_900 },
        payment: {
          amount: 199_900,
          currency: 'INR',
          keyId: 'rzp_test_fake_key',
          testMode: true,
        },
      });
      expect(response.body.data.payment.gatewayOrderId).toMatch(/^order_test_/);

      const order = await asAsha('get', `/api/orders/${response.body.data.orderId}`).expect(200);
      expect(order.body.data).toMatchObject({ status: 'pending', paymentStatus: 'pending' });

      const cart = await asAsha('get', '/api/cart').expect(200);
      expect(cart.body.data.items).toEqual([]);
    });

    it('confirms the order once the payment verifies', async () => {
      await addToCart(headphonesId, 1).expect(200);

      const placed = await place('online').expect(201);
      const gatewayOrderId = placed.body.data.payment.gatewayOrderId as string;
      const gatewayPaymentId = 'pay_test_000001';

      gateway.registerPayment({
        id: gatewayPaymentId,
        orderId: gatewayOrderId,
        amount: 199_900,
        currency: 'INR',
        status: 'captured',
        method: 'upi',
      });

      const verified = await asAsha('post', '/api/checkout/verify-payment')
        .send({
          gatewayOrderId,
          gatewayPaymentId,
          signature: gateway.signCheckout(gatewayOrderId, gatewayPaymentId),
        })
        .expect(200);

      expect(verified.body.data).toMatchObject({
        verified: true,
        orderId: placed.body.data.orderId,
        orderNumber: placed.body.data.orderNumber,
        paymentStatus: 'captured',
        orderStatus: 'confirmed',
        total: 199_900,
      });

      const order = await asAsha('get', `/api/orders/${placed.body.data.orderId}`).expect(200);
      expect(order.body.data).toMatchObject({
        status: 'confirmed',
        paymentStatus: 'paid',
        // The gateway's own instrument is recorded on the payment, refining the
        // `card` placeholder the order was created with.
        payment: { method: 'upi' },
      });
    });

    it('rejects a forged signature with 422 and leaves the order unpaid', async () => {
      await addToCart(headphonesId, 1).expect(200);

      const placed = await place('online').expect(201);

      const response = await asAsha('post', '/api/checkout/verify-payment')
        .send({
          gatewayOrderId: placed.body.data.payment.gatewayOrderId,
          gatewayPaymentId: 'pay_test_000002',
          signature: 'f'.repeat(64),
        })
        .expect(422);

      expect(response.body.message).toMatch(/signature/i);

      const order = await asAsha('get', `/api/orders/${placed.body.data.orderId}`).expect(200);
      expect(order.body.data.paymentStatus).toBe('pending');
    });
  });
});
