// test/notifications.e2e-spec.ts

import type { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { Role } from '../src/common/enums/role.enum.js';
import { MailSender } from '../src/modules/notifications/mail/mail-sender.js';
import type { MailMessage } from '../src/modules/notifications/mail/mail-sender.js';
import type { CreateProductInput } from '../src/modules/products/repositories/products.repository.js';
import { createTestApp } from './support/create-test-app.js';
import { FakeImageStorage } from './support/fake-image-storage.js';
import { FakePaymentGateway } from './support/fake-payment-gateway.js';
import { HardeningTestModule } from './support/hardening-test.module.js';
import { InMemoryAddressesRepository } from './support/in-memory-addresses.repository.js';
import { InMemoryCartsRepository } from './support/in-memory-carts.repository.js';
import { InMemoryCategoriesRepository } from './support/in-memory-categories.repository.js';
import { InMemoryCustomersRepository } from './support/in-memory-customers.repository.js';
import { InMemoryInventoryRepository } from './support/in-memory-inventory.repository.js';
import { InMemoryNotificationsRepository } from './support/in-memory-notifications.repository.js';
import { InMemoryOffersRepository } from './support/in-memory-offers.repository.js';
import { InMemoryOrdersRepository } from './support/in-memory-orders.repository.js';
import { InMemoryPaymentEventsRepository } from './support/in-memory-payment-events.repository.js';
import { InMemoryPaymentsRepository } from './support/in-memory-payments.repository.js';
import { InMemoryProductsRepository } from './support/in-memory-products.repository.js';
import { InMemoryRedemptionsRepository } from './support/in-memory-redemptions.repository.js';
import { InMemorySessionsRepository } from './support/in-memory-sessions.repository.js';
import { InMemorySettingsRepository } from './support/in-memory-settings.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
  process.env.JWT_ACCESS_SECRET = 'integration-test-secret-value-32-chars-min';
  process.env.BCRYPT_ROUNDS = '4';
  // One suite places/reads a lot from a single IP.
  process.env.THROTTLE_LIMIT = '10000';
  process.env.FRONTEND_URL = 'https://shop.example';
});

/**
 * Recording transport.
 *
 * The suite proves both halves of the design: with a working transport the email is
 * `delivered` and its contents follow the template; without one (the `afterEach`
 * variant) the notification is still recorded and the email is `skipped`.
 */
class RecordingMailer extends MailSender {
  readonly configured = true;
  readonly transport = 'recording';
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }

  reset(): void {
    this.sent.length = 0;
  }
}

const ADMIN = { email: 'owner@example.com', password: 'Adm1nPassw0rd' };
const ASHA = { email: 'asha@example.com', password: 'Str0ngPassw0rd' };
const RAVI = { email: 'ravi@example.com', password: 'RaviPassw0rd' };

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

describe('Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let ashaToken: string;
  let raviToken: string;
  let ashaId: string;
  let products: InMemoryProductsRepository;
  let orders: InMemoryOrdersRepository;
  let carts: InMemoryCartsRepository;
  let addresses: InMemoryAddressesRepository;
  let notifications: InMemoryNotificationsRepository;
  let mailer: RecordingMailer;
  let headphonesId: string;
  let addressId: string;

  const server = () => app.getHttpServer();

  const asAsha = (method: 'get' | 'post' | 'patch', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${ashaToken}`);

  const asRavi = (method: 'get' | 'post', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${raviToken}`);

  const asAdmin = (method: 'get' | 'post' | 'patch', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${adminToken}`);

  async function login(email: string, password: string): Promise<string> {
    const response = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.data.accessToken as string;
  }

  /** Adds the headphones to the cart and places a cash-on-delivery order. */
  async function placeCodOrder(): Promise<{ id: string; orderNumber: string }> {
    await asAsha('post', '/api/cart/items')
      .send({ productId: headphonesId, quantity: 1 })
      .expect(200);

    const placed = await asAsha('post', '/api/checkout/place')
      .send({ addressId, paymentMethod: 'cod' })
      .expect(201);

    return {
      id: placed.body.data.orderId as string,
      orderNumber: placed.body.data.orderNumber as string,
    };
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

    const asha = users.seed({
      email: ASHA.email,
      passwordHash: await bcrypt.hash(ASHA.password, 4),
      firstName: 'Asha',
      lastName: 'Rao',
      phone: '+91 90000 00001',
      role: Role.Customer,
      isActive: true,
    });
    ashaId = asha.id;

    users.seed({
      email: RAVI.email,
      passwordHash: await bcrypt.hash(RAVI.password, 4),
      firstName: 'Ravi',
      lastName: 'Kumar',
      role: Role.Customer,
      isActive: true,
    });

    const categories = new InMemoryCategoriesRepository();
    categories.seed({ id: AUDIO_ID, name: 'Audio', slug: 'audio' });

    products = new InMemoryProductsRepository();
    orders = new InMemoryOrdersRepository();
    carts = new InMemoryCartsRepository();
    addresses = new InMemoryAddressesRepository();
    notifications = new InMemoryNotificationsRepository();
    mailer = new RecordingMailer();

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
      notifications,
      mailSender: mailer,
      imageStorage: new FakeImageStorage(),
    });

    adminToken = await login(ADMIN.email, ADMIN.password);
    ashaToken = await login(ASHA.email, ASHA.password);
    raviToken = await login(RAVI.email, RAVI.password);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    products.reset();
    orders.reset();
    carts.reset();
    addresses.reset();
    notifications.reset();
    mailer.reset();

    headphonesId = products.seed({ ...HEADPHONES }).id;

    const address = await asAsha('post', '/api/addresses').send(ADDRESS).expect(201);
    addressId = address.body.data.id as string;
  });

  // ------------------------------------------------------------- authorization

  describe('authorization', () => {
    it('requires a signed-in user for the customer feed', async () => {
      await request(server()).get('/api/notifications').expect(401);
      await request(server()).get('/api/notifications/unread-count').expect(401);
      await request(server()).post('/api/notifications/read-all').expect(401);
      await request(server()).post('/api/notifications/000000000000000000000000/read').expect(401);
    });

    it('keeps a customer out of the operator console feed', async () => {
      await asAsha('get', '/api/admin/notifications').expect(403);
      await asAsha('get', '/api/admin/notifications/stats').expect(403);
      await asAsha('post', '/api/admin/notifications/000000000000000000000000/retry').expect(403);
    });
  });

  // ------------------------------------------------------------------- triggers

  describe('events', () => {
    it('welcomes a new customer and emails them', async () => {
      const response = await request(server())
        .post('/api/auth/register')
        .send({
          email: 'newcomer@example.com',
          password: 'Str0ngPassw0rd',
          firstName: 'New',
          lastName: 'Comer',
        })
        .expect(201);

      const token = response.body.data.accessToken as string;
      const feed = await request(server())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(feed.body.data).toHaveLength(1);
      expect(feed.body.data[0]).toMatchObject({
        type: 'welcome',
        category: 'account',
        read: false,
        link: '/products',
      });
      expect(feed.body.meta.unread).toBe(1);
      expect(mailer.sent).toHaveLength(1);
      expect(mailer.sent[0].to).toBe('newcomer@example.com');
      expect(mailer.sent[0].text).toContain('Thanks for creating an account');
      // Absolute links only — an email client cannot resolve `/products`.
      expect(mailer.sent[0].html).toContain('https://shop.example/products');
    });

    it('notifies the customer and the shop when an order is placed', async () => {
      const order = await placeCodOrder();

      const mine = await asAsha('get', '/api/notifications').expect(200);
      const types = mine.body.data.map((item: { type: string }) => item.type);

      // Placement (pending) and the COD confirmation that follows it.
      expect(types).toEqual(expect.arrayContaining(['order_placed', 'order_confirmed']));

      const placed = mine.body.data.find(
        (item: { type: string }) => item.type === 'order_placed',
      );

      expect(placed).toMatchObject({
        category: 'order',
        link: `/account/orders/${order.id}`,
        read: false,
      });
      expect(placed.title).toContain(order.orderNumber);
      expect(placed.body).toContain('1,999.00');
      expect(mine.body.meta.unread).toBe(2);

      const shop = await asAdmin('get', '/api/admin/notifications').expect(200);

      expect(shop.body.data).toHaveLength(1);
      expect(shop.body.data[0]).toMatchObject({
        type: 'order_placed',
        audience: 'admin',
        link: `/admin/orders/${order.id}`,
        emailStatus: 'skipped',
      });
      // One per customer, one action — never the same message twice.
      expect(mailer.sent.filter((message) => message.subject.includes(order.orderNumber))).toHaveLength(2);
    });

    it('announces a cancellation to the customer', async () => {
      const order = await placeCodOrder();

      await asAdmin('post', `/api/admin/orders/${order.id}/cancel`)
        .send({ reason: 'Out of stock at the warehouse' })
        .expect(200);

      const feed = await asAsha('get', '/api/notifications').expect(200);
      const cancelled = feed.body.data.find(
        (item: { type: string }) => item.type === 'order_cancelled',
      );

      expect(cancelled).toBeDefined();
      expect(cancelled.body).toContain('Out of stock at the warehouse');
      expect(cancelled.link).toBe(`/account/orders/${order.id}`);
    });

    it('does not repeat a notification for a replayed checkout', async () => {
      await asAsha('post', '/api/cart/items')
        .send({ productId: headphonesId, quantity: 1 })
        .expect(200);

      const first = await asAsha('post', '/api/checkout/place')
        .send({ addressId, paymentMethod: 'cod', idempotencyKey: 'checkout-replay-1' })
        .expect(201);

      const before = notifications.all().length;

      // Refill the cart, then replay the same checkout: the orders module returns the
      // existing order instead of creating a second one, so nothing is announced twice.
      await asAsha('post', '/api/cart/items')
        .send({ productId: headphonesId, quantity: 1 })
        .expect(200);

      const replay = await asAsha('post', '/api/checkout/place')
        .send({ addressId, paymentMethod: 'cod', idempotencyKey: 'checkout-replay-1' });

      expect([201, 409]).toContain(replay.status);
      expect(replay.body.data?.orderId ?? first.body.data.orderId).toBe(first.body.data.orderId);
      expect(notifications.all().length).toBe(before);
    });
  });

  // -------------------------------------------------------------- customer feed

  describe('customer feed', () => {
    beforeEach(async () => {
      await placeCodOrder();
    });

    it('lists newest first and counts the unread ones', async () => {
      const response = await asAsha('get', '/api/notifications').expect(200);

      expect(response.body.meta).toMatchObject({ page: 1, total: 2 });
      expect(response.body.meta.unread).toBe(2);
      expect(response.body.data[0].createdAt >= response.body.data[1].createdAt).toBe(true);
    });

    it('filters by unreadOnly without inverting the flag', async () => {
      const unread = await asAsha('get', '/api/notifications').query({ unreadOnly: 'true' }).expect(200);

      expect(unread.body.data).toHaveLength(2);

      const first = unread.body.data[0];
      await asAsha('post', `/api/notifications/${first.id}/read`).expect(200);

      const stillUnread = await asAsha('get', '/api/notifications').query({ unreadOnly: 'true' }).expect(200);
      const all = await asAsha('get', '/api/notifications').query({ unreadOnly: 'false' }).expect(200);
      const count = await asAsha('get', '/api/notifications/unread-count').expect(200);

      expect(stillUnread.body.data).toHaveLength(1);
      expect(all.body.data).toHaveLength(2);
      expect(count.body.data).toEqual({ unread: 1 });
    });

    it('marks one read, then everything', async () => {
      const feed = await asAsha('get', '/api/notifications').expect(200);
      const target = feed.body.data[0];

      const read = await asAsha('post', `/api/notifications/${target.id}/read`).expect(200);
      expect(read.body.data).toMatchObject({ id: target.id, read: true });

      const all = await asAsha('post', '/api/notifications/read-all').expect(200);
      expect(all.body.data).toEqual({ updated: 1 });

      const count = await asAsha('get', '/api/notifications/unread-count').expect(200);
      expect(count.body.data).toEqual({ unread: 0 });
    });

    it('never shows one customer another customer’s notifications', async () => {
      const feed = await asAsha('get', '/api/notifications').expect(200);
      const target = feed.body.data[0];

      const other = await asRavi('get', '/api/notifications').expect(200);
      expect(other.body.data).toHaveLength(0);

      // Not found, not forbidden: an id from another account says nothing about it.
      await asRavi('post', `/api/notifications/${target.id}/read`).expect(404);
      await asRavi('post', '/api/notifications/000000000000000000000000/read').expect(404);

      const after = await asAsha('get', '/api/notifications').expect(200);
      expect(after.body.data.find((item: { id: string }) => item.id === target.id).read).toBe(false);
    });

    it('pages the feed', async () => {
      const page = await asAsha('get', '/api/notifications')
        .query({ page: 2, limit: 1 })
        .expect(200);

      expect(page.body.data).toHaveLength(1);
      expect(page.body.meta).toMatchObject({ page: 2, limit: 1, total: 2, totalPages: 2 });
    });
  });

  // ------------------------------------------------------------ operator console

  describe('admin console', () => {
    it('lists the shop feed with stats and the email transport', async () => {
      await placeCodOrder();

      const response = await asAdmin('get', '/api/admin/notifications').expect(200);

      expect(response.body.meta.total).toBe(1);
      expect(response.body.data[0].emailSubject).toContain('New order');

      const stats = await asAdmin('get', '/api/admin/notifications/stats').expect(200);
      // The shop alert is in-app only, so its email half is honestly `skipped`.
      expect(stats.body.data.stats).toMatchObject({ total: 1, unread: 1, emailSkipped: 1 });
      expect(stats.body.data.email).toEqual({ configured: true, transport: 'recording' });
    });

    it('lets an operator read a customer’s messages for support', async () => {
      await placeCodOrder();

      const response = await asAdmin('get', '/api/admin/notifications')
        .query({ audience: 'customer' })
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((item: { audience: string }) => item.audience === 'customer')).toBe(
        true,
      );
      expect(response.body.data[0].recipientEmail).toBe(ASHA.email);
    });

    it('filters by email state, type and search', async () => {
      const order = await placeCodOrder();

      const byType = await asAdmin('get', '/api/admin/notifications')
        .query({ audience: 'customer', type: 'order_confirmed' })
        .expect(200);
      expect(byType.body.data).toHaveLength(1);

      const delivered = await asAdmin('get', '/api/admin/notifications')
        .query({ audience: 'customer', emailStatus: 'delivered' })
        .expect(200);
      expect(delivered.body.data).toHaveLength(2);

      const searched = await asAdmin('get', '/api/admin/notifications')
        .query({ search: order.orderNumber })
        .expect(200);
      expect(searched.body.data).toHaveLength(1);
    });

    it('marks a shop notification read', async () => {
      await placeCodOrder();

      const feed = await asAdmin('get', '/api/admin/notifications').expect(200);
      const target = feed.body.data[0];

      const read = await asAdmin('post', `/api/admin/notifications/${target.id}/read`).expect(200);
      expect(read.body.data).toMatchObject({ id: target.id, read: true });

      const stats = await asAdmin('get', '/api/admin/notifications/stats').expect(200);
      expect(stats.body.data.stats.unread).toBe(0);
      expect(stats.body.data.email.configured).toBe(true);
      expect(stats.body.data.categories).toContain('inventory');
    });

    it('refuses a retry for a message that was already delivered', async () => {
      await placeCodOrder();

      const feed = await asAdmin('get', '/api/admin/notifications')
        .query({ audience: 'customer' })
        .expect(200);

      const response = await asAdmin(
        'post',
        `/api/admin/notifications/${feed.body.data[0].id}/retry`,
      ).expect(409);

      expect(response.body.message).toMatch(/already emailed/i);
    });

    it('re-sends a failed email and records the new outcome', async () => {
      await placeCodOrder();

      const feed = await asAdmin('get', '/api/admin/notifications')
        .query({ audience: 'customer' })
        .expect(200);
      const target = feed.body.data[0];

      notifications.markEmailFailed(target.id, 'Mailbox unavailable');

      const retried = await asAdmin(
        'post',
        `/api/admin/notifications/${target.id}/retry`,
      ).expect(200);

      expect(retried.body.data).toMatchObject({ emailStatus: 'delivered', attempts: 2 });
      expect(retried.body.data.emailError).toBeNull();
    });

    it('404s a retry for an unknown notification', async () => {
      await asAdmin('post', '/api/admin/notifications/000000000000000000000000/retry').expect(404);
    });
  });
});

// ------------------------------------------------------------ degraded email

describe('with no mail transport', () => {
  let bare: INestApplication<App>;
  let bareToken: string;

  const bareServer = () => bare.getHttpServer();

  beforeAll(async () => {
    // Nothing is seeded: the shopper is created by the registration below, which is
    // exactly what produces the welcome message under test.
    const users = new InMemoryUsersRepository();

    bare = await createTestApp({
      imports: [HardeningTestModule],
      users,
      sessions: new InMemorySessionsRepository(),
      products: new InMemoryProductsRepository(),
      categories: new InMemoryCategoriesRepository(),
      orders: new InMemoryOrdersRepository(),
      customers: new InMemoryCustomersRepository(users, new InMemoryOrdersRepository()),
      payments: new InMemoryPaymentsRepository(),
      paymentEvents: new InMemoryPaymentEventsRepository(),
      paymentGateway: new FakePaymentGateway(),
      offers: new InMemoryOffersRepository(),
      redemptions: new InMemoryRedemptionsRepository(),
      addresses: new InMemoryAddressesRepository(),
      carts: new InMemoryCartsRepository(),
      settings: new InMemorySettingsRepository(),
      notifications: new InMemoryNotificationsRepository(),
      // No `mailSender`: the harness defaults to the no-op sender, exactly like a
      // store that never configured SMTP.
      imageStorage: new FakeImageStorage(),
    });

    // Registering (not signing in) is what a new shopper does, and it is what
    // produces the welcome message.
    const register = await request(bareServer())
      .post('/api/auth/register')
      .send({
        email: 'solo@example.com',
        password: 'Str0ngPassw0rd',
        firstName: 'Solo',
        lastName: 'Shopper',
      })
      .expect(201);

    bareToken = register.body.data.accessToken as string;
  });

  afterAll(async () => {
    await bare?.close();
  });

  it('still records the notification, with the email marked skipped', async () => {
    const response = await request(bareServer())
      .get('/api/notifications')
      .set('Authorization', `Bearer ${bareToken}`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].type).toBe('welcome');
    expect(response.body.meta.unread).toBe(1);
  });
});
