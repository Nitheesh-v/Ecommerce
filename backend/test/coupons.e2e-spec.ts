import type { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { Role } from '../src/common/enums/role.enum.js';
import { createTestApp } from './support/create-test-app.js';
import { FakeImageStorage } from './support/fake-image-storage.js';
import { HardeningTestModule } from './support/hardening-test.module.js';
import { InMemoryCategoriesRepository } from './support/in-memory-categories.repository.js';
import { InMemoryInventoryRepository } from './support/in-memory-inventory.repository.js';
import { InMemoryOffersRepository } from './support/in-memory-offers.repository.js';
import { InMemoryOrdersRepository } from './support/in-memory-orders.repository.js';
import { InMemoryProductsRepository } from './support/in-memory-products.repository.js';
import { InMemoryRedemptionsRepository } from './support/in-memory-redemptions.repository.js';
import { InMemorySessionsRepository } from './support/in-memory-sessions.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
  process.env.JWT_ACCESS_SECRET = 'integration-test-secret-value-32-char-min';
  process.env.BCRYPT_ROUNDS = '4';
  // One suite issues many requests from the same IP; the limiter has its own spec.
  process.env.THROTTLE_LIMIT = '10000';
});

const ADMIN = { email: 'owner@example.com', password: 'Adm1nPassw0rd' };
const ASHA = { email: 'asha@example.com', password: 'Str0ngPassw0rd' };
const RAVI = { email: 'ravi@example.com', password: 'Str0ngPassw0rd' };

const AUDIO_ID = '64b7f1c2a1b2c3d4e5f60001';
const HOME_ID = '64b7f1c2a1b2c3d4e5f60002';

const ADDRESS = {
  recipientName: 'Asha Rao',
  phone: '+91 90000 00001',
  line1: '10 Curzon Street',
  city: 'Coimbatore',
  state: 'Tamil Nadu',
  postalCode: '641001',
  country: 'India',
};

const day = 86_400_000;

describe('Offers & coupons (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let ashaToken: string;
  let raviToken: string;
  let users: InMemoryUsersRepository;
  let products: InMemoryProductsRepository;
  let orders: InMemoryOrdersRepository;
  let offers: InMemoryOffersRepository;
  let redemptions: InMemoryRedemptionsRepository;
  let headphonesId: string;
  let lampId: string;
  let cheapId: string;
  let ashaId: string;
  let raviId: string;

  const server = () => app.getHttpServer();

  const asAdmin = (method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${adminToken}`);

  const asAsha = (method: 'get' | 'post', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${ashaToken}`);

  async function login(email: string, password: string): Promise<string> {
    const response = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.data.accessToken as string;
  }

  /** Offer payload that is valid unless a test overrides a field. */
  function offerPayload(overrides: Record<string, unknown> = {}) {
    return {
      name: 'Diwali 10% off',
      description: 'Festive discount',
      code: 'DIWALI10',
      type: 'percentage',
      value: 10,
      minCartValue: 0,
      startsAt: new Date(Date.now() - day).toISOString(),
      endsAt: new Date(Date.now() + 7 * day).toISOString(),
      perCustomerLimit: 1,
      ...overrides,
    };
  }

  async function createOffer(overrides: Record<string, unknown> = {}) {
    const response = await asAdmin('post', '/api/admin/offers')
      .send(offerPayload(overrides))
      .expect(201);

    return response.body.data as Record<string, any>;
  }

  function checkout(body: Record<string, unknown>, token = ashaToken) {
    return request(server())
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: headphonesId, quantity: 1 }],
        shippingAddress: ADDRESS,
        paymentMethod: 'cod',
        ...body,
      });
  }

  async function confirmOrder(orderId: string): Promise<void> {
    await asAdmin('patch', `/api/admin/orders/${orderId}/status`)
      .send({ status: 'confirmed' })
      .expect(200);
  }

  beforeAll(async () => {
    users = new InMemoryUsersRepository();
    const sessions = new InMemorySessionsRepository();

    users.seed({
      email: ADMIN.email,
      passwordHash: await bcrypt.hash(ADMIN.password, 4),
      firstName: 'Store',
      lastName: 'Owner',
      role: Role.Admin,
      isActive: true,
    });

    ashaId = users.seed({
      email: ASHA.email,
      passwordHash: await bcrypt.hash(ASHA.password, 4),
      firstName: 'Asha',
      lastName: 'Rao',
      role: Role.Customer,
      isActive: true,
    }).id;

    raviId = users.seed({
      email: RAVI.email,
      passwordHash: await bcrypt.hash(RAVI.password, 4),
      firstName: 'Ravi',
      lastName: 'Kumar',
      role: Role.Customer,
      isActive: true,
    }).id;

    const categories = new InMemoryCategoriesRepository();
    categories.seed({ id: AUDIO_ID, name: 'Audio', slug: 'audio' });
    categories.seed({ id: HOME_ID, name: 'Home', slug: 'home' });

    products = new InMemoryProductsRepository();
    const inventory = new InMemoryInventoryRepository(products);
    orders = new InMemoryOrdersRepository();
    offers = new InMemoryOffersRepository();
    redemptions = new InMemoryRedemptionsRepository();

    app = await createTestApp({
      imports: [HardeningTestModule],
      users,
      sessions,
      products,
      categories,
      inventory,
      orders,
      offers,
      redemptions,
      imageStorage: new FakeImageStorage(),
    });

    adminToken = await login(ADMIN.email, ADMIN.password);
    ashaToken = await login(ASHA.email, ASHA.password);
    raviToken = await login(RAVI.email, RAVI.password);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    products.reset();
    orders.reset();
    offers.reset();
    redemptions.reset();
    users.forceStatus(ashaId, 'active');
    users.forceStatus(raviId, 'active');

    headphonesId = products.seed({
      name: 'Wireless Headphones',
      slug: 'wireless-headphones',
      description: 'Studio-grade wireless headphones.',
      sku: 'SKU-AU-1001',
      categoryId: AUDIO_ID,
      price: 249_900,
      salePrice: 199_900,
      costPrice: 150_000,
      stock: 100,
      lowStockThreshold: 3,
      status: 'published',
      isFeatured: false,
      images: [],
    }).id;

    lampId = products.seed({
      name: 'Reading Lamp',
      slug: 'reading-lamp',
      description: 'Warm desk lamp.',
      sku: 'SKU-HO-2001',
      categoryId: HOME_ID,
      price: 120_000,
      costPrice: 60_000,
      stock: 100,
      lowStockThreshold: 3,
      status: 'published',
      isFeatured: false,
      images: [],
    }).id;

    cheapId = products.seed({
      name: 'Cable Organiser',
      slug: 'cable-organiser',
      description: 'Keeps cables tidy.',
      sku: 'SKU-AU-3001',
      categoryId: AUDIO_ID,
      price: 50_000,
      costPrice: 20_000,
      stock: 100,
      lowStockThreshold: 3,
      status: 'published',
      isFeatured: false,
      images: [],
    }).id;
  });

  describe('authorization', () => {
    it('blocks anonymous and customer access to every admin route', async () => {
      await request(server()).get('/api/admin/offers').expect(401);
      await request(server()).get('/api/admin/offers/summary').expect(401);
      await request(server()).get('/api/admin/redemptions').expect(401);
      await request(server()).post('/api/admin/offers').send(offerPayload()).expect(401);

      await asAsha('get', '/api/admin/offers').expect(403);
      await asAsha('get', '/api/admin/offers/summary').expect(403);
      await asAsha('get', '/api/admin/redemptions').expect(403);
      await asAsha('get', '/api/admin/redemptions/export').expect(403);

      await request(server())
        .post('/api/admin/offers')
        .set('Authorization', `Bearer ${ashaToken}`)
        .send(offerPayload())
        .expect(403);
    });

    it('keeps validation and the public offers page reachable without a session', async () => {
      offers.seed({ code: 'PUBLIC10', value: 10 });

      await request(server())
        .post('/api/coupons/validate')
        .send({ code: 'PUBLIC10', items: [{ productId: headphonesId, quantity: 1 }] })
        .expect(200);

      await request(server()).get('/api/offers/active').expect(200);
    });
  });

  describe('offer management', () => {
    it('creates an offer with a normalised code and a derived status', async () => {
      const created = await createOffer({ code: 'diwali10' });

      expect(created).toMatchObject({
        code: 'DIWALI10',
        type: 'percentage',
        value: 10,
        status: 'active',
        statusLabel: 'Active',
        usageCount: 0,
        redeemedCount: 0,
        valueLabel: '10% off',
      });
      expect(created.history[0]).toMatchObject({ action: 'created' });
      expect(created.createdBy).toBe(ADMIN.email);
    });

    it('refuses a duplicate code regardless of case', async () => {
      await createOffer({ code: 'DIWALI10' });

      const conflict = await asAdmin('post', '/api/admin/offers')
        .send(offerPayload({ code: 'diwali10', name: 'Another offer' }))
        .expect(409);

      expect(conflict.body.message).toContain('DIWALI10');
    });

    it('rejects invalid or conflicting configurations', async () => {
      const invalid: Array<Record<string, unknown>> = [
        { value: 150 },
        { value: 0 },
        { startsAt: new Date(Date.now() + day).toISOString(), endsAt: new Date().toISOString() },
        { type: 'fixed', value: 10_000, maxDiscount: 5_000 },
        { type: 'free_shipping', value: 100 },
        { totalUsageLimit: 1, perCustomerLimit: 2 },
        { applicableProductIds: [headphonesId], excludedProductIds: [headphonesId] },
        { code: 'BAD CODE' },
      ];

      for (const overrides of invalid) {
        await asAdmin('post', '/api/admin/offers')
          .send(offerPayload(overrides))
          .expect(400);
      }
    });

    it('filters and sorts the console list and reports counts', async () => {
      await createOffer({ code: 'ACTIVE10', name: 'Active offer' });
      await createOffer({
        code: 'LATER10',
        name: 'Later offer',
        startsAt: new Date(Date.now() + 2 * day).toISOString(),
        endsAt: new Date(Date.now() + 9 * day).toISOString(),
      });
      await createOffer({
        code: 'OLD10',
        name: 'Old offer',
        startsAt: new Date(Date.now() - 9 * day).toISOString(),
        endsAt: new Date(Date.now() - day).toISOString(),
      });

      const active = await asAdmin('get', '/api/admin/offers?status=active').expect(200);
      expect(active.body.data).toHaveLength(1);
      expect(active.body.data[0].code).toBe('ACTIVE10');

      const scheduled = await asAdmin('get', '/api/admin/offers?status=scheduled').expect(200);
      expect(scheduled.body.data[0].code).toBe('LATER10');

      const expired = await asAdmin('get', '/api/admin/offers?status=expired').expect(200);
      expect(expired.body.data[0].code).toBe('OLD10');

      const searched = await asAdmin('get', '/api/admin/offers?search=OLD10').expect(200);
      expect(searched.body.data).toHaveLength(1);

      const fixedOnly = await asAdmin('get', '/api/admin/offers?type=fixed').expect(200);
      expect(fixedOnly.body.data).toHaveLength(0);

      const summary = await asAdmin('get', '/api/admin/offers/summary').expect(200);
      expect(summary.body.data).toMatchObject({
        totalOffers: 3,
        activeOffers: 1,
        scheduledOffers: 1,
        expiredOffers: 1,
      });
    });

    it('switches an offer off, back on, and archives it without deleting history', async () => {
      const offer = await createOffer();

      const off = await asAdmin('patch', `/api/admin/offers/${offer.id}/status`)
        .send({ isActive: false, reason: 'Campaign paused' })
        .expect(200);
      expect(off.body.data).toMatchObject({ isActive: false, status: 'inactive' });

      await request(server())
        .post('/api/coupons/validate')
        .send({ code: offer.code, items: [{ productId: headphonesId, quantity: 1 }] })
        .expect(400);

      await asAdmin('patch', `/api/admin/offers/${offer.id}/status`)
        .send({ isActive: true })
        .expect(200);

      const archived = await asAdmin('delete', `/api/admin/offers/${offer.id}`).expect(200);
      expect(archived.body.data).toMatchObject({
        isActive: false,
        customerVisible: false,
        status: 'inactive',
      });
      expect(
        archived.body.data.history.map((entry: { action: string }) => entry.action),
      ).toContain('archived');

      const detail = await asAdmin('get', `/api/admin/offers/${offer.id}`).expect(200);
      expect(detail.body.data.history.length).toBeGreaterThanOrEqual(3);
    });

    it('re-validates the merged configuration on edit', async () => {
      const offer = await createOffer();

      await asAdmin('patch', `/api/admin/offers/${offer.id}`)
        .send({ value: 140 })
        .expect(400);

      await asAdmin('patch', `/api/admin/offers/${offer.id}`)
        .send({ endsAt: new Date(Date.now() - 2 * day).toISOString() })
        .expect(400);

      const updated = await asAdmin('patch', `/api/admin/offers/${offer.id}`)
        .send({ name: 'Renamed offer', value: 25 })
        .expect(200);

      expect(updated.body.data).toMatchObject({ name: 'Renamed offer', value: 25 });

      await createOffer({ code: 'OTHER10', name: 'Other' });
      await asAdmin('patch', `/api/admin/offers/${offer.id}`)
        .send({ code: 'OTHER10' })
        .expect(409);
    });
  });

  describe('coupon validation', () => {
    it('prices a percentage coupon from server-side product data', async () => {
      offers.seed({ code: 'TENOFF', value: 10 });

      const response = await asAdmin('post', '/api/coupons/validate')
        .send({ code: 'tenoff', items: [{ productId: headphonesId, quantity: 2 }] })
        .expect(200);

      expect(response.body.data).toMatchObject({
        valid: true,
        code: 'TENOFF',
        type: 'percentage',
        eligibleSubtotal: 399_800,
        discount: 39_980,
        shippingCharge: 0,
        total: 359_820,
      });
    });

    it('never lets a fixed discount exceed the eligible goods value', async () => {
      offers.seed({ code: 'BIGFIX', type: 'fixed', value: 900_000 });

      const response = await asAdmin('post', '/api/coupons/validate')
        .send({ code: 'BIGFIX', items: [{ productId: cheapId, quantity: 1 }] })
        .expect(200);

      expect(response.body.data.discount).toBe(50_000);
      expect(response.body.data.total).toBe(0);
      expect(response.body.data.shippingCharge).toBe(0);
    });

    it('waives the shipping charge for a free-shipping coupon', async () => {
      // ₹500 of goods is under the ₹999 free-shipping threshold → ₹49 normally.
      const withoutCoupon = await asAdmin('post', '/api/coupons/validate')
        .send({ code: 'MISSING', items: [{ productId: cheapId, quantity: 1 }] })
        .expect(400);
      expect(withoutCoupon.body.success).toBe(false);

      offers.seed({ code: 'FREESHIP', type: 'free_shipping', value: 0 });

      const response = await asAdmin('post', '/api/coupons/validate')
        .send({ code: 'FREESHIP', items: [{ productId: cheapId, quantity: 1 }] })
        .expect(200);

      expect(response.body.data).toMatchObject({
        freeShipping: true,
        discount: 0,
        shippingCharge: 0,
        total: 50_000,
      });
    });

    it('refuses unknown, inactive, scheduled, expired and exhausted codes', async () => {
      offers.seed({ code: 'INACTIVE', isActive: false });
      offers.seed({
        code: 'LATER',
        startsAt: new Date(Date.now() + day),
        endsAt: new Date(Date.now() + 2 * day),
      });
      offers.seed({
        code: 'GONE',
        startsAt: new Date(Date.now() - 2 * day),
        endsAt: new Date(Date.now() - day),
      });
      offers.seed({ code: 'USEDUP', totalUsageLimit: 1, usageCount: 1 });

      const cases: Array<[string, string]> = [
        ['NOPE', 'not valid'],
        ['INACTIVE', 'no longer available'],
        ['LATER', 'not active yet'],
        ['GONE', 'expired'],
        ['USEDUP', 'usage limit'],
      ];

      for (const [code, fragment] of cases) {
        const response = await request(server())
          .post('/api/coupons/validate')
          .send({ code, items: [{ productId: headphonesId, quantity: 1 }] })
          .expect(400);

        expect(response.body.message.toLowerCase()).toContain(fragment);
      }
    });

    it('enforces the minimum cart value against eligible items only', async () => {
      offers.seed({ code: 'MIN1500', minCartValue: 150_000 });

      const response = await asAdmin('post', '/api/coupons/validate')
        .send({ code: 'MIN1500', items: [{ productId: cheapId, quantity: 1 }] })
        .expect(400);

      expect(response.body.message).toContain('Add');
    });

    it('honours product and category restrictions and exclusions', async () => {
      offers.seed({ code: 'HOMEONLY', applicableCategoryIds: [HOME_ID] });

      await asAdmin('post', '/api/coupons/validate')
        .send({ code: 'HOMEONLY', items: [{ productId: headphonesId, quantity: 1 }] })
        .expect(400);

      const allowed = await asAdmin('post', '/api/coupons/validate')
        .send({
          code: 'HOMEONLY',
          items: [
            { productId: headphonesId, quantity: 1 },
            { productId: lampId, quantity: 1 },
          ],
        })
        .expect(200);

      // Only the lamp qualifies: 10% of ₹1200.
      expect(allowed.body.data.eligibleSubtotal).toBe(120_000);
      expect(allowed.body.data.discount).toBe(12_000);

      offers.seed({
        code: 'NOTLAMP',
        excludedProductIds: [lampId],
        applicableCategoryIds: [HOME_ID],
      });

      await asAdmin('post', '/api/coupons/validate')
        .send({ code: 'NOTLAMP', items: [{ productId: lampId, quantity: 1 }] })
        .expect(400);
    });

    it('blocks a customer who already used a one-per-customer coupon', async () => {
      const offer = await createOffer({ code: 'ONCE', value: 10 });
      offers.seed({ id: offer.id, code: 'ONCE', value: 10, usageCount: 1 });
      await offers.reserveUsage(offer.id, {
        customerKey: ashaId,
        now: new Date(),
      });

      // Without a session there is no identity to check — the preview passes and
      // checkout still refuses the code when it reserves the use.
      await request(server())
        .post('/api/coupons/validate')
        .send({ code: 'ONCE', items: [{ productId: headphonesId, quantity: 1 }] })
        .expect(200);

      const asCustomer = await request(server())
        .post('/api/coupons/validate')
        .set('Authorization', `Bearer ${ashaToken}`)
        .send({ code: 'ONCE', items: [{ productId: headphonesId, quantity: 1 }] })
        .expect(400);

      expect(asCustomer.body.message).toContain('already used');
    });
  });

  describe('checkout with a coupon', () => {
    it('applies the discount to the order and reserves a redemption', async () => {
      const offer = await createOffer({ code: 'DIWALI10', value: 10 });

      const response = await checkout({ couponCode: 'diwali10' }).expect(201);
      const order = response.body.data.order;

      expect(order).toMatchObject({
        subtotal: 249_900,
        discountTotal: 50_000,
        couponCode: 'DIWALI10',
        couponDiscount: 19_990,
        total: 179_910,
        status: 'pending',
      });

      const stored = offers.all().find((entry) => entry.id === offer.id);
      expect(stored?.usageCount).toBe(1);
      expect(stored?.redeemedCount).toBe(0);

      const list = await asAdmin('get', '/api/admin/redemptions').expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({
        code: 'DIWALI10',
        orderId: order.id,
        status: 'reserved',
        discountAmount: 19_990,
        customerEmail: ASHA.email,
      });
    });

    it('finalises the redemption when the order is confirmed', async () => {
      await createOffer({ code: 'DIWALI10', value: 10 });
      const created = await checkout({ couponCode: 'DIWALI10' }).expect(201);

      await confirmOrder(created.body.data.order.id);

      const list = await asAdmin('get', '/api/admin/redemptions').expect(200);
      expect(list.body.data[0]).toMatchObject({ status: 'redeemed' });
      expect(list.body.data[0].redeemedAt).toBeTruthy();

      const summary = await asAdmin('get', '/api/admin/offers/summary').expect(200);
      expect(summary.body.data).toMatchObject({
        totalRedemptions: 1,
        totalDiscountGiven: 19_990,
      });
    });

    it('releases the use when the order is cancelled', async () => {
      const offer = await createOffer({ code: 'DIWALI10', value: 10, totalUsageLimit: 1 });
      const created = await checkout({ couponCode: 'DIWALI10' }).expect(201);

      await asAdmin('patch', `/api/admin/orders/${created.body.data.order.id}/status`)
        .send({ status: 'cancelled', reason: 'Customer changed their mind' })
        .expect(200);

      const stored = offers.all().find((entry) => entry.id === offer.id);
      expect(stored?.usageCount).toBe(0);
      expect(stored?.redeemedCount).toBe(0);

      const list = await asAdmin('get', '/api/admin/redemptions').expect(200);
      expect(list.body.data[0]).toMatchObject({
        status: 'reversed',
        reversalReason: expect.stringContaining('cancelled'),
      });

      // The single use is available again.
      await checkout({ couponCode: 'DIWALI10', idempotencyKey: 'retry-1' }).expect(201);
    });

    it('does not record a second redemption when the checkout is replayed', async () => {
      await createOffer({ code: 'DIWALI10', value: 10 });

      const first = await checkout({
        couponCode: 'DIWALI10',
        idempotencyKey: 'checkout-replay-1',
      }).expect(201);
      const replay = await checkout({
        couponCode: 'DIWALI10',
        idempotencyKey: 'checkout-replay-1',
      }).expect(201);

      expect(replay.body.data.order.id).toBe(first.body.data.order.id);
      expect(redemptions.all()).toHaveLength(1);
    });

    it('enforces the total usage limit and the per-customer limit', async () => {
      await createOffer({ code: 'ONLYONE', value: 10, totalUsageLimit: 1 });

      await checkout({ couponCode: 'ONLYONE', idempotencyKey: 'limit-1' }).expect(201);

      const second = await checkout({ couponCode: 'ONLYONE', idempotencyKey: 'limit-2' })
        .expect(400);
      expect(second.body.message.toLowerCase()).toContain('usage limit');

      offers.reset();
      await createOffer({ code: 'PERCUST', value: 10, totalUsageLimit: 5, perCustomerLimit: 1 });
      await checkout({ couponCode: 'PERCUST', idempotencyKey: 'pc-1' }).expect(201);

      const repeat = await checkout({
        couponCode: 'PERCUST',
        idempotencyKey: 'pc-2',
      }).expect(400);
      expect(repeat.body.message).toContain('already used');
    });

    it('lets only one of two simultaneous checkouts take the last use', async () => {
      await createOffer({ code: 'RACE', value: 10, totalUsageLimit: 1 });

      const [first, second] = await Promise.all([
        checkout({ couponCode: 'RACE', idempotencyKey: 'race-a' }),
        checkout({ couponCode: 'RACE', idempotencyKey: 'race-b' }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses[0]).toBe(201);
      expect([400, 409]).toContain(statuses[1]);
      expect(redemptions.all()).toHaveLength(1);
      expect(offers.all().filter((offer) => offer.code === 'RACE')[0].usageCount).toBe(1);
    });

    it('rejects a coupon on a cart it does not cover', async () => {
      await createOffer({
        code: 'HOMEONLY',
        type: 'fixed',
        value: 10_000,
        applicableCategoryIds: [HOME_ID],
      });

      const response = await checkout({ couponCode: 'HOMEONLY' }).expect(400);

      expect(response.body.message).toContain('does not apply');
      expect(orders.all()).toHaveLength(0);
    });
  });

  describe('redemption console', () => {
    it('lists, filters and exports redemptions', async () => {
      await createOffer({ code: 'EXPORT10', value: 10, perCustomerLimit: 2 });
      const first = await checkout({ couponCode: 'EXPORT10', idempotencyKey: 'ex-1' }).expect(201);
      const second = await checkout({
        couponCode: 'EXPORT10',
        idempotencyKey: 'ex-2',
        items: [{ productId: lampId, quantity: 1 }],
      }).expect(201);

      await confirmOrder(first.body.data.order.id);

      const all = await asAdmin('get', '/api/admin/redemptions').expect(200);
      expect(all.body.meta.total).toBe(2);

      const redeemed = await asAdmin('get', '/api/admin/redemptions?status=redeemed').expect(200);
      expect(redeemed.body.data).toHaveLength(1);

      const search = await asAdmin('get', '/api/admin/redemptions?search=EXPORT10').expect(200);
      expect(search.body.data).toHaveLength(2);

      const forOrder = await asAdmin(
        'get',
        `/api/admin/offers/${all.body.data[0].offerId}/redemptions`,
      ).expect(200);
      expect(forOrder.body.data).toHaveLength(2);

      const csv = await asAdmin('get', '/api/admin/redemptions/export').expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text.split('\r\n')[0]).toContain('Coupon code');
      expect(csv.text).toContain(second.body.data.order.orderNumber);
    });

    it('reverses a redemption when a delivered order is returned', async () => {
      const offer = await createOffer({ code: 'RETURNED', value: 10 });
      const created = await checkout({ couponCode: 'RETURNED' }).expect(201);
      const orderId = created.body.data.order.id as string;

      for (const status of ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered']) {
        await asAdmin('patch', `/api/admin/orders/${orderId}/status`)
          .send({ status })
          .expect(200);
      }

      let stored = offers.all().find((entry) => entry.id === offer.id);
      expect(stored?.redeemedCount).toBe(1);

      const requested = await asAdmin('post', `/api/admin/orders/${orderId}/returns`)
        .send({ reason: 'Item arrived damaged', items: [{ productId: headphonesId, quantity: 1 }] })
        .expect(201);
      const returnId = requested.body.data.returns[0].returnId as string;

      await asAdmin('patch', `/api/admin/orders/${orderId}/returns/${returnId}`)
        .send({ action: 'approve' })
        .expect(200);
      await asAdmin('patch', `/api/admin/orders/${orderId}/returns/${returnId}`)
        .send({ action: 'receive' })
        .expect(200);
      await asAdmin('patch', `/api/admin/orders/${orderId}/returns/${returnId}`)
        .send({ action: 'inspect', restockApproved: true })
        .expect(200);
      // Completing the return moves the order to `returned` in the same write.
      await asAdmin('patch', `/api/admin/orders/${orderId}/returns/${returnId}`)
        .send({ action: 'complete' })
        .expect(200);

      stored = offers.all().find((entry) => entry.id === offer.id);
      expect(stored?.redeemedCount).toBe(0);
      expect(stored?.usageCount).toBe(0);

      const list = await asAdmin('get', '/api/admin/redemptions').expect(200);
      expect(list.body.data[0].status).toBe('reversed');
    });
  });

  describe('public offers page', () => {
    it('shows only active, customer-visible offers without internal settings', async () => {
      offers.seed({
        code: 'VISIBLE10',
        name: 'Visible offer',
        description: 'Ten percent off',
        applicableCategoryIds: [AUDIO_ID],
      });
      offers.seed({ code: 'HIDDEN10', name: 'Hidden offer', customerVisible: false });
      offers.seed({ code: 'OFF10', name: 'Inactive offer', isActive: false });
      offers.seed({
        code: 'LATER10',
        name: 'Future offer',
        startsAt: new Date(Date.now() + day),
        endsAt: new Date(Date.now() + 2 * day),
      });

      const response = await request(server()).get('/api/offers/active').expect(200);
      const payload = JSON.stringify(response.body);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        code: 'VISIBLE10',
        valueLabel: '10% off',
        applicableCategories: [{ id: AUDIO_ID, name: 'Audio' }],
      });

      // Internal campaign settings never leave the admin surface.
      expect(payload).not.toContain('usageCount');
      expect(payload).not.toContain('perCustomerLimit');
      expect(payload).not.toContain('totalUsageLimit');
      expect(payload).not.toContain('isActive');
      expect(payload).not.toContain('createdBy');
    });

    it('hides an offer once its usage limit is reached', async () => {
      offers.seed({ code: 'LASTONE', totalUsageLimit: 1, usageCount: 1 });

      const response = await request(server()).get('/api/offers/active').expect(200);

      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('order money is untouched', () => {
    it('keeps the original discount snapshot when the offer changes later', async () => {
      const offer = await createOffer({ code: 'SNAPSHOT', value: 10 });
      const created = await checkout({ couponCode: 'SNAPSHOT' }).expect(201);
      const orderId = created.body.data.order.id as string;

      await asAdmin('patch', `/api/admin/offers/${offer.id}`)
        .send({ value: 50 })
        .expect(200);

      const order = await asAdmin('get', `/api/admin/orders/${orderId}`).expect(200);

      expect(order.body.data).toMatchObject({
        couponCode: 'SNAPSHOT',
        couponDiscount: 19_990,
        total: 179_910,
      });
    });
  });
});
