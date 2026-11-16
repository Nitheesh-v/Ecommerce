// test/guest-cart.e2e-spec.ts

/**
 * Guest carts and guest checkout.
 *
 * The point of this suite is the *boundary*: a shopper with no account must be able
 * to fill a cart and place an order, and must still not be able to reach anything
 * that belongs to somebody else. Every assertion below is about one of those two
 * things.
 */
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
  process.env.THROTTLE_LIMIT = '10000';
});

const ADMIN = { email: 'owner@example.com', password: 'Adm1nPassw0rd' };
const ASHA = { email: 'asha@example.com', password: 'Str0ngPassw0rd' };

const AUDIO_ID = '64b7f1c2a1b2c3d4e5f60011';

/** Two guest tokens in the shape the browser generates (32 bytes, base64url). */
const GUEST_A = 'dGhpcy1pcy1hLWd1ZXN0LWNhcnQtdG9rZW4tYQ';
const GUEST_B = 'dGhpcy1pcy1hLWd1ZXN0LWNhcnQtdG9rZW4tYg';

const PRODUCT: CreateProductInput = {
  name: 'Wireless Headphones',
  slug: 'wireless-headphones',
  description: 'Studio-grade wireless headphones.',
  sku: 'SKU-AU-3001',
  categoryId: AUDIO_ID,
  price: 249_900,
  salePrice: 199_900,
  costPrice: 150_000,
  stock: 10,
  lowStockThreshold: 3,
  status: 'published',
  isFeatured: false,
  images: [],
};

const GUEST_ADDRESS = {
  recipientName: 'Ravi Kumar',
  phone: '+91 90000 11111',
  line1: '9 Marina Street',
  city: 'Chennai',
  state: 'Tamil Nadu',
  postalCode: '600001',
  country: 'India',
};

describe('Guest cart & checkout (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let ashaToken: string;
  let products: InMemoryProductsRepository;
  let orders: InMemoryOrdersRepository;
  let carts: InMemoryCartsRepository;
  let addresses: InMemoryAddressesRepository;
  let productId: string;
  let ashaAddressId: string;

  const server = () => app.getHttpServer();

  /** A guest request: no token, an opaque cart id — exactly what the browser sends. */
  const asGuest = (method: 'get' | 'post' | 'patch' | 'delete', url: string, token = GUEST_A) =>
    request(server())[method](url).set('x-cart-id', token);

  const asAsha = (method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${ashaToken}`);

  async function login(email: string, password: string): Promise<string> {
    const response = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.data.accessToken as string;
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
      role: Role.Customer,
      isActive: true,
    });

    const categories = new InMemoryCategoriesRepository();
    categories.seed({ id: AUDIO_ID, name: 'Audio', slug: 'audio' });

    products = new InMemoryProductsRepository();
    orders = new InMemoryOrdersRepository();
    carts = new InMemoryCartsRepository();
    addresses = new InMemoryAddressesRepository();

    app = await createTestApp({
      imports: [HardeningTestModule],
      users,
      sessions,
      products,
      categories,
      inventory: new InMemoryInventoryRepository(products),
      orders,
      customers: new InMemoryCustomersRepository(users, orders),
      payments: new InMemoryPaymentsRepository(),
      paymentEvents: new InMemoryPaymentEventsRepository(),
      paymentGateway: new FakePaymentGateway(),
      offers: new InMemoryOffersRepository(),
      redemptions: new InMemoryRedemptionsRepository(),
      addresses,
      carts,
      settings: new InMemorySettingsRepository(),
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
    carts.reset();
    addresses.reset();

    productId = products.seed({ ...PRODUCT }).id;

    await request(server())
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ codEnabled: true, codMaxAmount: 0 })
      .expect(200);

    const address = await asAsha('post', '/api/addresses').send({
      ...GUEST_ADDRESS,
      recipientName: 'Asha Rao',
    }).expect(201);

    ashaAddressId = address.body.data.id as string;
  });

  // --------------------------------------------------------------- the cart

  describe('a guest can use a cart', () => {
    it('starts empty, adds a product and prices it from the catalogue', async () => {
      const empty = await asGuest('get', '/api/cart').expect(200);

      expect(empty.body.data.items).toEqual([]);
      expect(empty.body.data.totals.total).toBe(0);

      const added = await asGuest('post', '/api/cart/items')
        .send({ productId, quantity: 2 })
        .expect(200);

      expect(added.body.data.items).toHaveLength(1);
      expect(added.body.data.items[0]).toMatchObject({
        productId,
        quantity: 2,
        unitPrice: 199_900,
        available: true,
      });
      // Two units at the sale price, above the free-shipping threshold, with no
      // shipping added — all of it computed by the server.
      expect(added.body.data.totals.total).toBe(199_900 * 2);
      expect(added.body.data.totals.shippingCharge).toBe(0);
    });

    it('keeps two guests’ carts apart', async () => {
      await asGuest('post', '/api/cart/items')
        .send({ productId, quantity: 1 })
        .expect(200);

      const otherGuest = await asGuest('get', '/api/cart', GUEST_B).expect(200);

      expect(otherGuest.body.data.items).toEqual([]);
    });

    it('updates and removes a line', async () => {
      await asGuest('post', '/api/cart/items')
        .send({ productId, quantity: 1 })
        .expect(200);

      const updated = await asGuest('patch', `/api/cart/items/${productId}`)
        .send({ quantity: 3 })
        .expect(200);

      expect(updated.body.data.items[0].quantity).toBe(3);

      const removed = await asGuest('delete', `/api/cart/items/${productId}`).expect(200);

      expect(removed.body.data.items).toEqual([]);
    });

    it('refuses more than the stock on hand', async () => {
      await asGuest('post', '/api/cart/items')
        .send({ productId, quantity: 99 })
        .expect(409);
    });
  });

  // ------------------------------------------------------------- isolation

  describe('isolation', () => {
    it('never lets a guest reach a signed-in customer’s cart', async () => {
      await asAsha('post', '/api/cart/items').send({ productId, quantity: 2 }).expect(200);

      // The guest's own cart is empty even though the customer's is not, and no
      // header value can name an account cart.
      const guest = await asGuest('get', '/api/cart').expect(200);

      expect(guest.body.data.items).toEqual([]);

      await asGuest('get', '/api/cart', `cart:${'a'.repeat(24)}`).expect(401);
    });

    it('prefers the account’s cart when both a token and a guest id are sent', async () => {
      await asGuest('post', '/api/cart/items').send({ productId, quantity: 1 }).expect(200);
      await asAsha('post', '/api/cart/items').send({ productId, quantity: 4 }).expect(200);

      const viaBoth = await request(server())
        .get('/api/cart')
        .set('Authorization', `Bearer ${ashaToken}`)
        .set('x-cart-id', GUEST_A)
        .expect(200);

      expect(viaBoth.body.data.items[0].quantity).toBe(4);
    });
  });

  // ---------------------------------------------------------------- merging

  describe('signing in', () => {
    it('merges the guest cart into the account, adding quantities', async () => {
      await asGuest('post', '/api/cart/items')
        .send({ productId, quantity: 2 })
        .expect(200);
      await asAsha('post', '/api/cart/items').send({ productId, quantity: 1 }).expect(200);

      const merged = await asAsha('post', '/api/cart/merge')
        .send({ guestCartId: GUEST_A })
        .expect(200);

      expect(merged.body.data.items).toHaveLength(1);
      expect(merged.body.data.items[0].quantity).toBe(3);
    });

    it('retires the guest cart so its token cannot be replayed', async () => {
      await asGuest('post', '/api/cart/items').send({ productId, quantity: 2 }).expect(200);
      await asAsha('post', '/api/cart/merge').send({ guestCartId: GUEST_A }).expect(200);

      // The old token now opens nothing — not even for the account that merged it.
      const replay = await asGuest('get', '/api/cart').expect(200);

      expect(replay.body.data.items).toEqual([]);
    });

    it('clamps a merged line to live stock', async () => {
      // Guest takes 8 of 10, the account already holds 8 — the merge cannot exceed 10.
      await asGuest('post', '/api/cart/items').send({ productId, quantity: 8 }).expect(200);
      await asAsha('post', '/api/cart/items').send({ productId, quantity: 8 }).expect(200);

      const merged = await asAsha('post', '/api/cart/merge')
        .send({ guestCartId: GUEST_A })
        .expect(200);

      expect(merged.body.data.items[0].quantity).toBe(10);
    });

    it('ignores a guest id that was never issued', async () => {
      await asAsha('post', '/api/cart/items').send({ productId, quantity: 1 }).expect(200);

      const response = await asAsha('post', '/api/cart/merge')
        .send({ guestCartId: 'x'.repeat(40) })
        .expect(200);

      expect(response.body.data.items[0].quantity).toBe(1);
    });

    it('requires an account to merge', async () => {
      await asGuest('post', '/api/cart/merge').send({ guestCartId: GUEST_A }).expect(401);
    });
  });

  // --------------------------------------------------------------- checkout

  describe('guest checkout', () => {
    const guestOrder = (paymentMethod: 'cod' | 'online' = 'cod', extra: object = {}) => ({
      guestAddress: GUEST_ADDRESS,
      guestEmail: 'ravi@example.com',
      paymentMethod,
      ...extra,
    });

    it('previews and places a COD order with a typed address', async () => {
      await asGuest('post', '/api/cart/items').send({ productId, quantity: 1 }).expect(200);

      // `preview` is a dry run for a *chosen* address: a guest's address is typed
      // into place, so the preview sends it without the email (that belongs to the
      // order, not the quote).
      const { guestEmail: _email, ...previewBody } = guestOrder();
      const preview = await asGuest('post', '/api/checkout/preview')
        .send(previewBody)
        .expect(200);

      expect(preview.body.data.address).toMatchObject({
        recipientName: 'Ravi Kumar',
        city: 'Chennai',
      });
      expect(preview.body.data.totals.total).toBeGreaterThan(0);

      const placed = await asGuest('post', '/api/checkout/place')
        .send(guestOrder())
        .expect(201);

      expect(placed.body.data).toMatchObject({
        paymentMethod: 'cod',
        requiresPayment: false,
        created: true,
      });

      const stored = await orders.findById(placed.body.data.orderId as string);

      // No account, the email they typed, and the shopper — not staff — recorded
      // as the actor.
      expect(stored?.userId ?? null).toBeNull();
      expect(stored?.customerEmail).toBe('ravi@example.com');
      expect(stored?.customerName).toBe('Ravi Kumar');

      // The cart is spent, and stock actually moved.
      const after = await asGuest('get', '/api/cart').expect(200);

      expect(after.body.data.items).toEqual([]);
      expect((await products.findById(productId))?.stock).toBe(9);
    });

    it('refuses to place an order without a delivery address', async () => {
      await asGuest('post', '/api/cart/items').send({ productId, quantity: 1 }).expect(200);

      await asGuest('post', '/api/checkout/place')
        .send({ paymentMethod: 'cod', guestEmail: 'ravi@example.com' })
        .expect(400);
    });

    it('refuses a saved address id from a guest', async () => {
      await asGuest('post', '/api/cart/items').send({ productId, quantity: 1 }).expect(200);

      // A guest has no address book, and naming somebody's saved address must not
      // become a way to order to it.
      await asGuest('post', '/api/checkout/place')
        .send({ addressId: ashaAddressId, paymentMethod: 'cod', guestEmail: 'ravi@example.com' })
        .expect(400);
    });

    it('keeps the address validation rules the address book uses', async () => {
      await asGuest('post', '/api/cart/items').send({ productId, quantity: 1 }).expect(200);

      await asGuest('post', '/api/checkout/place')
        .send(guestOrder('cod', { guestAddress: { ...GUEST_ADDRESS, phone: 'abc' } }))
        .expect(400);

      await asGuest('post', '/api/checkout/place')
        .send(guestOrder('cod', { guestAddress: { ...GUEST_ADDRESS, postalCode: '!' } }))
        .expect(400);
    });

    it('does not leak another cart’s contents into the order', async () => {
      await asGuest('post', '/api/cart/items').send({ productId, quantity: 1 }).expect(200);
      await asGuest('post', '/api/cart/items', GUEST_B)
        .send({ productId, quantity: 5 })
        .expect(200);

      const placed = await asGuest('post', '/api/checkout/place')
        .send(guestOrder())
        .expect(201);

      const stored = await orders.findById(placed.body.data.orderId as string);

      expect(stored?.items[0].quantity).toBe(1);
      // The other guest still has their five.
      const other = await asGuest('get', '/api/cart', GUEST_B).expect(200);

      expect(other.body.data.items[0].quantity).toBe(5);
    });
  });

  describe('guest order lookup', () => {
    it('finds the order with the number and email it was placed with', async () => {
      await asGuest('post', '/api/cart/items').send({ productId, quantity: 1 }).expect(200);

      const placed = await asGuest('post', '/api/checkout/place')
        .send({ guestAddress: GUEST_ADDRESS, guestEmail: 'ravi@example.com', paymentMethod: 'cod' })
        .expect(201);

      const found = await request(server())
        .get('/api/orders/guest')
        .query({ orderNumber: placed.body.data.orderNumber, email: 'ravi@example.com' })
        .expect(200);

      expect(found.body.data.id).toBe(placed.body.data.orderId);
      expect(found.body.data.customerEmail).toBe('ravi@example.com');
      // The email is matched case-insensitively — people do not remember how they typed it.
      await request(server())
        .get('/api/orders/guest')
        .query({ orderNumber: placed.body.data.orderNumber, email: 'RAVI@Example.com' })
        .expect(200);
    });

    it('answers 404 for a wrong email, a wrong number and a malformed pair', async () => {
      await asGuest('post', '/api/cart/items').send({ productId, quantity: 1 }).expect(200);

      const placed = await asGuest('post', '/api/checkout/place')
        .send({ guestAddress: GUEST_ADDRESS, guestEmail: 'ravi@example.com', paymentMethod: 'cod' })
        .expect(201);

      const { orderNumber, orderId } = placed.body.data;

      await request(server())
        .get('/api/orders/guest')
        .query({ orderNumber, email: 'someone@example.com' })
        .expect(404);

      await request(server())
        .get('/api/orders/guest')
        .query({ orderNumber: 'ORD-20260101-0001', email: 'ravi@example.com' })
        .expect(404);

      // A bare id is not a credential: there is no way to read an order by guessing before.
      await request(server())
        .get('/api/orders/guest')
        .query({ orderNumber: orderId, email: 'ravi@example.com' })
        .expect(400);

      await request(server()).get('/api/orders/guest').query({ orderNumber }).expect(400);
    });

    it('will not expose an account’s order to a guest who knows its number and email', async () => {
      // Asha is signed in; the order records her email as the customer. Her own
      // cart needs a line first — an empty basket cannot be checked out.
      await asAsha('post', '/api/cart/items').send({ productId, quantity: 1 }).expect(200);

      const created = await asAsha('post', '/api/checkout/place')
        .send({ addressId: ashaAddressId, paymentMethod: 'cod' })
        .expect(201);

      const byNumber = await request(server())
        .get('/api/orders/guest')
        .query({ orderNumber: created.body.data.orderNumber, email: ASHA.email })
        .expect(404);

      expect(byNumber.body.message).toBe('Order not found');
    });
  });
});
