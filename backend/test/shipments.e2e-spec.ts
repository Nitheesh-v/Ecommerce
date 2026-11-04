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
import { InMemoryCustomersRepository } from './support/in-memory-customers.repository.js';
import { InMemoryInventoryRepository } from './support/in-memory-inventory.repository.js';
import { InMemoryOrdersRepository } from './support/in-memory-orders.repository.js';
import { InMemoryProductsRepository } from './support/in-memory-products.repository.js';
import { InMemorySessionsRepository } from './support/in-memory-sessions.repository.js';
import { InMemoryShipmentsRepository } from './support/in-memory-shipments.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
  process.env.JWT_ACCESS_SECRET = 'integration-test-secret-value-32-char-min';
  process.env.BCRYPT_ROUNDS = '4';
  process.env.THROTTLE_LIMIT = '10000';
});

const ADMIN = { email: 'owner@example.com', password: 'Adm1nPassw0rd' };
const ASHA = { email: 'asha@example.com', password: 'Str0ngPassw0rd' };
const RAVI = { email: 'ravi@example.com', password: 'Str0ngPassw0rd' };

const ADDRESS = {
  recipientName: 'Asha Rao',
  phone: '+91 90000 00001',
  line1: '10 Curzon Street',
  line2: 'Near the library',
  city: 'Coimbatore',
  state: 'Tamil Nadu',
  postalCode: '641001',
  country: 'India',
};

const MANUAL_COURIER = {
  courierProvider: 'manual',
  courierName: 'Delhivery Surface',
  trackingNumber: 'AWB-10001',
  shippingCost: 4_900,
};

describe('Shipping & delivery (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let ashaToken: string;
  let users: InMemoryUsersRepository;
  let orders: InMemoryOrdersRepository;
  let shipments: InMemoryShipmentsRepository;
  let ashaId: string;
  let raviId: string;

  const server = () => app.getHttpServer();

  const asAdmin = (method: 'get' | 'post' | 'patch', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${adminToken}`);

  const asAsha = (method: 'get', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${ashaToken}`);

  async function login(email: string, password: string): Promise<string> {
    const response = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.data.accessToken as string;
  }

  function seedOrder(overrides: Parameters<InMemoryOrdersRepository['seed']>[0] = {}) {
    return orders.seed({
      userId: ashaId,
      customerName: 'Asha Rao',
      customerEmail: ASHA.email,
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'card',
      total: 100_000,
      payment: { method: 'card', paidAmount: 100_000, refunds: [] },
      shippingAddress: ADDRESS,
      items: [
        {
          productId: '64b7f1c2a1b2c3d4e5f60011',
          name: 'Aurora Headphones',
          sku: 'AUR-001',
          slug: 'aurora-headphones',
          imageUrl: null,
          unitPrice: 50_000,
          quantity: 2,
          lineTotal: 100_000,
        },
      ] as never,
      ...overrides,
    });
  }

  /** Creates a shipment through the API and returns the created view. */
  async function createShipment(
    orderId: string,
    body: Record<string, unknown> = {},
  ): Promise<Record<string, any>> {
    const response = await asAdmin('post', '/api/admin/shipments')
      .send({ orderId, ...MANUAL_COURIER, ...body })
      .expect(201);

    return response.body.data as Record<string, any>;
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
      phone: '+91 90000 00001',
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
    categories.seed({ id: '64b7f1c2a1b2c3d4e5f60001', name: 'Audio', slug: 'audio' });

    const products = new InMemoryProductsRepository();
    const inventory = new InMemoryInventoryRepository(products);
    orders = new InMemoryOrdersRepository();
    shipments = new InMemoryShipmentsRepository();

    app = await createTestApp({
      imports: [HardeningTestModule],
      users,
      sessions,
      products,
      categories,
      inventory,
      orders,
      shipments,
      customers: new InMemoryCustomersRepository(users, orders),
      imageStorage: new FakeImageStorage(),
    });

    adminToken = await login(ADMIN.email, ADMIN.password);
    ashaToken = await login(ASHA.email, ASHA.password);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    orders.reset();
    shipments.reset();
    users.forceStatus(ashaId, 'active');
    users.forceStatus(raviId, 'active');
  });

  describe('authorization', () => {
    it('requires authentication on every shipping route', async () => {
      await request(server()).get('/api/admin/shipments').expect(401);
      await request(server()).get('/api/admin/shipments/summary').expect(401);
      await request(server()).get('/api/admin/shipments/eligible').expect(401);
      await request(server()).post('/api/admin/shipments').send({}).expect(401);
      await request(server()).get('/api/orders/64b7f1c2a1b2c3d4e5f60001/tracking').expect(401);
    });

    it('refuses customers on every admin shipping route', async () => {
      const order = seedOrder();
      const shipment = shipments.seed({ orderId: order.id });

      await asAsha('get', '/api/admin/shipments').expect(403);
      await asAsha('get', '/api/admin/shipments/summary').expect(403);
      await asAsha('get', '/api/admin/shipments/couriers').expect(403);
      await asAsha('get', '/api/admin/shipments/eligible').expect(403);
      await asAsha('get', `/api/admin/shipments/${shipment.id}`).expect(403);
      await asAsha('get', `/api/admin/shipments/${shipment.id}/history`).expect(403);

      await request(server())
        .post('/api/admin/shipments')
        .set('Authorization', `Bearer ${ashaToken}`)
        .send({ orderId: order.id, ...MANUAL_COURIER })
        .expect(403);

      await request(server())
        .patch(`/api/admin/shipments/${shipment.id}/status`)
        .set('Authorization', `Bearer ${ashaToken}`)
        .send({ status: 'delivered' })
        .expect(403);

      await request(server())
        .patch(`/api/admin/shipments/${shipment.id}/courier`)
        .set('Authorization', `Bearer ${ashaToken}`)
        .send({ courierProvider: 'manual', trackingNumber: 'HACK' })
        .expect(403);
    });
  });

  describe('creation', () => {
    it('creates a shipment, copies the address server-side and mirrors it onto the order', async () => {
      const order = seedOrder();

      const response = await asAdmin('post', '/api/admin/shipments')
        .send({
          orderId: order.id,
          ...MANUAL_COURIER,
          notes: 'Handle with care',
          weightGrams: 900,
          dimensions: { lengthCm: 20, widthCm: 15, heightCm: 10 },
          // A client-supplied address must be rejected outright (whitelist).
          shippingAddress: { recipientName: 'Somebody Else' },
        })
        .expect(400);

      expect(response.body.success).toBe(false);

      const created = await createShipment(order.id, {
        notes: 'Handle with care',
        weightGrams: 900,
        dimensions: { lengthCm: 20, widthCm: 15, heightCm: 10 },
      });

      expect(created.shipmentNumber).toMatch(/^SHP-\d{8}-\d{4}$/);
      expect(created.status).toBe('pending');
      expect(created.address).toMatchObject({
        recipientName: 'Asha Rao',
        city: 'Coimbatore',
        postalCode: '641001',
      });
      expect(created.courier).toMatchObject({
        provider: 'manual',
        name: 'Delhivery Surface',
        trackingNumber: 'AWB-10001',
      });
      expect(created.notes).toBe('Handle with care');
      expect(created.events).toHaveLength(1);
      expect(created.events[0]).toMatchObject({ type: 'created', to: 'pending' });

      const stored = await orders.findById(order.id);
      expect(stored?.shipping?.provider).toBe('Delhivery Surface');
      expect(stored?.shipping?.trackingNumber).toBe('AWB-10001');
      // Creating a shipment never changes the order's own status.
      expect(stored?.status).toBe('confirmed');
      expect(stored?.paymentStatus).toBe('paid');
    });

    it('rejects unknown and malformed order references', async () => {
      await asAdmin('post', '/api/admin/shipments')
        .send({ orderId: '64b7f1c2a1b2c3d4e5f6abcd', ...MANUAL_COURIER })
        .expect(404);

      await asAdmin('post', '/api/admin/shipments')
        .send({ orderId: 'not-an-id', ...MANUAL_COURIER })
        .expect(400);
    });

    it('refuses orders that are not confirmed or processing', async () => {
      for (const status of ['pending', 'shipped', 'delivered', 'cancelled'] as const) {
        const order = seedOrder({ status });

        await asAdmin('post', '/api/admin/shipments')
          .send({ orderId: order.id, ...MANUAL_COURIER })
          .expect(409);
      }
    });

    it('refuses an unpaid card order but ships an unpaid cash-on-delivery one', async () => {
      const unpaidCard = seedOrder({ paymentStatus: 'pending', paymentMethod: 'card' });

      await asAdmin('post', '/api/admin/shipments')
        .send({ orderId: unpaidCard.id, ...MANUAL_COURIER })
        .expect(409);

      const cod = seedOrder({ paymentStatus: 'pending', paymentMethod: 'cod' });

      await createShipment(cod.id);

      const stored = await orders.findById(cod.id);
      // Shipping a COD order never marks it paid.
      expect(stored?.paymentStatus).toBe('pending');
    });

    it('refuses a second live shipment for the same order', async () => {
      const order = seedOrder();
      const first = await createShipment(order.id);

      const conflict = await asAdmin('post', '/api/admin/shipments')
        .send({ orderId: order.id, ...MANUAL_COURIER })
        .expect(409);

      expect(conflict.body.message).toContain(first.shipmentNumber);
      expect(shipments.all()).toHaveLength(1);
    });

    it('rejects a tracking link without a tracking number', async () => {
      const order = seedOrder();

      await asAdmin('post', '/api/admin/shipments')
        .send({
          orderId: order.id,
          courierProvider: 'manual',
          shippingCost: 0,
          trackingUrl: 'https://track.example.com/abc',
        })
        .expect(400);
    });

    it('refuses an incomplete shipping address', async () => {
      const order = seedOrder({
        shippingAddress: { ...ADDRESS, phone: '' } as never,
      });

      await asAdmin('post', '/api/admin/shipments')
        .send({ orderId: order.id, ...MANUAL_COURIER })
        .expect(400);
    });
  });

  describe('courier assignment', () => {
    it('records the assignment in the history and mirrors it to the order', async () => {
      const order = seedOrder();
      const created = await createShipment(order.id, {
        courierName: undefined,
        trackingNumber: undefined,
      });

      const response = await asAdmin('patch', `/api/admin/shipments/${created.id}/courier`)
        .send({
          courierProvider: 'manual',
          courierName: 'Blue Dart',
          trackingNumber: 'BD-77',
          trackingUrl: 'https://track.example.com/BD-77',
          reason: 'Original partner could not pick up',
        })
        .expect(200);

      expect(response.body.data.courier).toMatchObject({
        provider: 'manual',
        name: 'Blue Dart',
        trackingNumber: 'BD-77',
        trackingUrl: 'https://track.example.com/BD-77',
      });

      const history = await asAdmin(
        'get',
        `/api/admin/shipments/${created.id}/history`,
      ).expect(200);

      const types = history.body.data.events.map((event: { type: string }) => event.type);
      expect(types).toContain('courier');
      expect(history.body.data.events[0].reason).toBe(
        'Original partner could not pick up',
      );

      expect((await orders.findById(order.id))?.shipping?.trackingNumber).toBe('BD-77');
    });

    it('refuses a courier change after delivery', async () => {
      const order = seedOrder();
      const created = await createShipment(order.id);

      for (const status of [
        'ready_to_ship',
        'shipped',
        'in_transit',
        'out_for_delivery',
        'delivered',
      ] as const) {
        await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
          .send({ status })
          .expect(200);
      }

      await asAdmin('patch', `/api/admin/shipments/${created.id}/courier`)
        .send({ courierProvider: 'manual', trackingNumber: 'LATE-EDIT' })
        .expect(409);
    });
  });

  describe('status management', () => {
    it('rejects an illegal jump and a repeated status', async () => {
      const order = seedOrder();
      const created = await createShipment(order.id);

      await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'delivered' })
        .expect(409);

      await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'pending' })
        .expect(400);
    });

    it('refuses to ship without a courier and a tracking number', async () => {
      const order = seedOrder();
      const created = await createShipment(order.id, {
        courierName: undefined,
        trackingNumber: undefined,
      });

      await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'ready_to_ship' })
        .expect(200);

      await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'shipped' })
        .expect(400);
    });

    it('walks the parcel through delivery and advances the order legally', async () => {
      const order = seedOrder();
      const created = await createShipment(order.id);

      await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'ready_to_ship' })
        .expect(200);

      const shipped = await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'shipped', note: 'Handed to courier' })
        .expect(200);

      expect(shipped.body.data.shippedAt).toBeTruthy();
      expect((await orders.findById(order.id))?.status).toBe('shipped');
      expect((await orders.findById(order.id))?.shipping?.shippedAt).toBeTruthy();

      await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'in_transit' })
        .expect(200);

      await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'out_for_delivery' })
        .expect(200);

      expect((await orders.findById(order.id))?.status).toBe('out_for_delivery');

      const delivered = await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'delivered' })
        .expect(200);

      expect(delivered.body.data.actualDelivery).toBeTruthy();
      expect((await orders.findById(order.id))?.status).toBe('delivered');
      expect((await orders.findById(order.id))?.shipping?.deliveredAt).toBeTruthy();

      // `delivered` is terminal.
      await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'in_transit' })
        .expect(409);
    });

    it('requires a reason for a failed delivery and lets the parcel be re-attempted', async () => {
      const order = seedOrder();
      const created = await createShipment(order.id);

      for (const status of ['ready_to_ship', 'shipped', 'in_transit', 'out_for_delivery'] as const) {
        await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
          .send({ status })
          .expect(200);
      }

      await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'delivery_failed' })
        .expect(400);

      const failed = await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'delivery_failed', reason: 'Recipient unavailable' })
        .expect(200);

      expect(failed.body.data.failureReason).toBe('Recipient unavailable');
      // A failed parcel does not silently "deliver" the order.
      expect((await orders.findById(order.id))?.status).toBe('out_for_delivery');

      await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'out_for_delivery' })
        .expect(200);

      await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'delivered' })
        .expect(200);
    });

    it('returns a parcel to sender and frees the order for a replacement shipment', async () => {
      const order = seedOrder();
      const created = await createShipment(order.id);

      for (const status of [
        'ready_to_ship',
        'shipped',
        'in_transit',
        'out_for_delivery',
      ] as const) {
        await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
          .send({ status })
          .expect(200);
      }

      // A return to sender is reached through the failure branch, not from a
      // parcel that is still happily out for delivery.
      await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'delivery_failed', reason: 'Address unreachable' })
        .expect(200);

      const returned = await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'returned_to_sender', reason: 'Address unreachable' })
        .expect(200);

      expect(returned.body.data.status).toBe('returned_to_sender');
      // `returned_to_sender` is terminal for this shipment.
      await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'delivered' })
        .expect(409);

      // The order still exists and is shippable again after the return.
      const replacement = await createShipment(order.id);
      expect(replacement.id).not.toBe(created.id);
      expect(shipments.all()).toHaveLength(2);
    });

    it('never moves a cancelled order when its parcel moves', async () => {
      const order = seedOrder();
      const created = await createShipment(order.id);

      orders.apply(order.id, { status: ['confirmed'] }, { set: { status: 'cancelled' } });

      await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'ready_to_ship' })
        .expect(200);

      expect((await orders.findById(order.id))?.status).toBe('cancelled');
    });
  });

  describe('console listing', () => {
    it('summarises shipments by delivery stage', async () => {
      const base = seedOrder();
      const second = seedOrder();
      const third = seedOrder();

      const ready = await createShipment(base.id);
      const moving = await createShipment(second.id);
      const delivered = await createShipment(third.id);

      await asAdmin('patch', `/api/admin/shipments/${ready.id}/status`)
        .send({ status: 'ready_to_ship' })
        .expect(200);

      for (const status of ['ready_to_ship', 'shipped'] as const) {
        await asAdmin('patch', `/api/admin/shipments/${moving.id}/status`)
          .send({ status })
          .expect(200);
      }

      for (const status of [
        'ready_to_ship',
        'shipped',
        'in_transit',
        'out_for_delivery',
        'delivered',
      ] as const) {
        await asAdmin('patch', `/api/admin/shipments/${delivered.id}/status`)
          .send({ status })
          .expect(200);
      }

      const response = await asAdmin('get', '/api/admin/shipments/summary').expect(200);

      expect(response.body.data).toMatchObject({
        totalCount: 3,
        delivered: 1,
        readyToShip: 1,
        shipped: 1,
      });
    });

    it('searches by tracking number and filters by status and courier', async () => {
      const first = seedOrder();
      const second = seedOrder();

      await createShipment(first.id);
      await createShipment(second.id, {
        courierName: 'Blue Dart',
        trackingNumber: 'BD-900',
      });

      const search = await asAdmin('get', '/api/admin/shipments?search=BD-900').expect(200);
      expect(search.body.data).toHaveLength(1);
      expect(search.body.data[0].orderId).toBe(second.id);

      const byStatus = await asAdmin(
        'get',
        '/api/admin/shipments?status=delivered',
      ).expect(200);
      expect(byStatus.body.data).toHaveLength(0);

      const byCourier = await asAdmin(
        'get',
        '/api/admin/shipments?courier=Blue%20Dart',
      ).expect(200);
      expect(byCourier.body.data).toHaveLength(1);
      expect(byCourier.body.meta.total).toBe(1);
    });

    it('lists eligible orders and hides the ones that already shipped', async () => {
      const shippable = seedOrder();
      const alreadyShipped = seedOrder();
      seedOrder({ status: 'pending' });
      seedOrder({ paymentStatus: 'pending', paymentMethod: 'card' });

      await createShipment(alreadyShipped.id);

      const response = await asAdmin('get', '/api/admin/shipments/eligible').expect(200);

      const ids = response.body.data.map((order: { id: string }) => order.id);
      expect(ids).toContain(shippable.id);
      expect(ids).not.toContain(alreadyShipped.id);
      expect(response.body.data).toHaveLength(1);
    });

    it('lists only the configured courier providers', async () => {
      const response = await asAdmin('get', '/api/admin/shipments/couriers').expect(200);

      expect(response.body.data.manualOnly).toBe(true);
      const manual = response.body.data.providers.find(
        (provider: { id: string }) => provider.id === 'manual',
      );
      expect(manual.enabled).toBe(true);
      const shiprocket = response.body.data.providers.find(
        (provider: { id: string }) => provider.id === 'shiprocket',
      );
      expect(shiprocket.enabled).toBe(false);
      // Missing credentials are named, not silently ignored.
      expect(shiprocket.missingConfiguration).toContain('SHIPROCKET_EMAIL');
    });
  });

  describe('customer tracking', () => {
    it('returns a customer-safe timeline without internal notes or staff identities', async () => {
      const order = seedOrder();
      const created = await createShipment(order.id, { notes: 'Internal: fragile' });

      await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'ready_to_ship', note: 'Internal: packed by staff' })
        .expect(200);

      const response = await asAsha('get', `/api/orders/${order.id}/tracking`).expect(200);
      const body = response.body.data;

      expect(body).toMatchObject({
        orderId: order.id,
        shipmentNumber: created.shipmentNumber,
        status: 'ready_to_ship',
        courier: { name: 'Delhivery Surface', trackingNumber: 'AWB-10001' },
      });
      expect(body.steps).toHaveLength(6);
      expect(body.events.map((event: { label: string }) => event.label)).toContain(
        'Ready to ship',
      );

      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('Internal:');
      expect(serialized).not.toContain('owner@example.com');
      expect(body.notes).toBeUndefined();
      expect(body.shippingCost).toBeUndefined();
      expect(body.address).toBeUndefined();
    });

    it("cannot read another customer's tracking", async () => {
      const order = seedOrder();
      await createShipment(order.id);

      users.forceStatus(raviId, 'active');
      const raviToken = await login(RAVI.email, RAVI.password);
      const axiosLike = await request(server())
        .get(`/api/orders/${order.id}/tracking`)
        .set('Authorization', `Bearer ${raviToken}`)
        .expect(404);

      expect(axiosLike.body.message).toBe('Order not found');
    });

    it('answers 404 when no shipment exists yet and 401 for anonymous callers', async () => {
      const order = seedOrder();

      await asAsha('get', `/api/orders/${order.id}/tracking`).expect(404);
      await request(server()).get(`/api/orders/${order.id}/tracking`).expect(401);
    });

    it('blocks suspended customers', async () => {
      const order = seedOrder();
      await createShipment(order.id);
      users.forceStatus(ashaId, 'suspended');

      await asAsha('get', `/api/orders/${order.id}/tracking`).expect(403);
    });
  });

  describe('detail', () => {
    it('returns the order summary, address and append-only history', async () => {
      const order = seedOrder();
      const created = await createShipment(order.id);

      await asAdmin('patch', `/api/admin/shipments/${created.id}/status`)
        .send({ status: 'ready_to_ship', note: 'Packed' })
        .expect(200);

      const response = await asAdmin('get', `/api/admin/shipments/${created.id}`).expect(200);
      const body = response.body.data;

      expect(body.order).toMatchObject({
        id: order.id,
        orderNumber: order.orderNumber,
        status: 'confirmed',
        paymentStatus: 'paid',
        itemCount: 2,
      });
      expect(body.order.items[0]).toMatchObject({ name: 'Aurora Headphones', quantity: 2 });
      expect(body.address.city).toBe('Coimbatore');
      expect(body.createdBy).toBe(ADMIN.email);
      expect(body.updatedBy).toBe(ADMIN.email);
      expect(body.events).toHaveLength(2);
      expect(body.events[0]).toMatchObject({ label: 'Ready to ship', note: 'Packed' });
      expect(body.events[1]).toMatchObject({ label: 'Shipment created' });

      await asAdmin('get', '/api/admin/shipments/64b7f1c2a1b2c3d4e5f6abcd').expect(404);
    });
  });
});
