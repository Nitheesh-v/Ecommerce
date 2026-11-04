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
import { InMemoryProductsRepository } from './support/in-memory-products.repository.js';
import { InMemorySessionsRepository } from './support/in-memory-sessions.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
  process.env.JWT_ACCESS_SECRET = 'integration-test-secret-value-32-chars-min';
  process.env.BCRYPT_ROUNDS = '4';
});

const ADMIN = { email: 'owner@example.com', password: 'Adm1nPassw0rd' };
const CUSTOMER = { email: 'customer@example.com', password: 'Str0ngPassw0rd' };

const AUDIO_ID = '64b7f1c2a1b2c3d4e5f60001';
const ACCESSORIES_ID = '64b7f1c2a1b2c3d4e5f60002';

describe('Inventory (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let customerToken: string;
  let products: InMemoryProductsRepository;
  let categories: InMemoryCategoriesRepository;
  let inventory: InMemoryInventoryRepository;

  const server = () => app.getHttpServer();

  const asAdmin = (method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${adminToken}`);

  async function login(email: string, password: string): Promise<string> {
    const response = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.data.accessToken as string;
  }

  /** Five storefront products with one of each stock state, plus an archived one. */
  function seedProducts() {
    const headphones = products.seed({
      name: 'Wireless Headphones',
      slug: 'wireless-headphones',
      description: 'Studio-grade wireless headphones.',
      sku: 'SKU-AU-1001',
      categoryId: AUDIO_ID,
      price: 249_900,
      costPrice: 150_000,
      stock: 12,
      lowStockThreshold: 3,
      status: 'published',
      isFeatured: true,
      images: [{ url: 'https://cdn.example.com/headphones.jpg' }],
    });

    const monitor = products.seed({
      name: 'Studio Monitor',
      slug: 'studio-monitor',
      description: 'Two-way active monitor.',
      sku: 'SKU-MON-2001',
      categoryId: AUDIO_ID,
      price: 899_900,
      costPrice: 700_000,
      stock: 5,
      lowStockThreshold: 5, // exactly at the threshold counts as low
      status: 'published',
      isFeatured: false,
      images: [],
    });

    const lamp = products.seed({
      name: 'Desk Lamp',
      slug: 'desk-lamp',
      description: 'Warm LED desk lamp.',
      sku: 'SKU-LMP-3001',
      categoryId: ACCESSORIES_ID,
      price: 49_900,
      costPrice: 30_000,
      stock: 0,
      lowStockThreshold: 2,
      status: 'published',
      isFeatured: false,
      images: [],
    });

    const cable = products.seed({
      name: 'USB-C Cable',
      slug: 'usb-c-cable',
      description: 'Two metre braided cable.',
      sku: 'SKU-CAB-3001',
      categoryId: ACCESSORIES_ID,
      price: 19_900,
      costPrice: 8_000,
      stock: 1,
      lowStockThreshold: 5,
      status: 'published',
      isFeatured: false,
      images: [],
    });

    const keyboard = products.seed({
      name: 'Mechanical Keyboard',
      slug: 'mechanical-keyboard',
      description: 'Hot-swappable 75% board.',
      sku: 'SKU-KEY-4001',
      categoryId: ACCESSORIES_ID,
      price: 129_900,
      costPrice: 90_000,
      stock: 40,
      lowStockThreshold: 10,
      status: 'published',
      isFeatured: false,
      images: [],
    });

    // Archived products are not inventory: they are excluded from every read.
    products.seed({
      name: 'Retired Speaker',
      slug: 'retired-speaker',
      description: 'Discontinued.',
      sku: 'SKU-OLD-9001',
      categoryId: AUDIO_ID,
      price: 99_900,
      costPrice: 50_000,
      stock: 3,
      lowStockThreshold: 2,
      status: 'archived',
      isFeatured: false,
      images: [],
    });

    return { headphones, monitor, lamp, cable, keyboard };
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
      email: CUSTOMER.email,
      passwordHash: await bcrypt.hash(CUSTOMER.password, 4),
      firstName: 'Nitheesh',
      lastName: 'V',
      role: Role.Customer,
      isActive: true,
    });

    categories = new InMemoryCategoriesRepository();
    categories.seed({ id: AUDIO_ID, name: 'Audio', slug: 'audio' });
    categories.seed({ id: ACCESSORIES_ID, name: 'Accessories', slug: 'accessories' });

    products = new InMemoryProductsRepository();
    inventory = new InMemoryInventoryRepository(products, (categoryId) =>
      categoryId === AUDIO_ID ? 'Audio' : categoryId === ACCESSORIES_ID ? 'Accessories' : null,
    );

    app = await createTestApp({
      imports: [HardeningTestModule],
      users,
      sessions,
      products,
      categories,
      inventory,
      imageStorage: new FakeImageStorage(),
    });

    adminToken = await login(ADMIN.email, ADMIN.password);
    customerToken = await login(CUSTOMER.email, CUSTOMER.password);
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Every test starts from the same five products with no movements/alerts. */
  beforeEach(() => {
    products.reset();
    inventory.reset();
    seedProducts();
  });

  describe('authorization', () => {
    it('hides the inventory API from anonymous callers', async () => {
      await request(server()).get('/api/admin/inventory').expect(401);
      await request(server()).get('/api/admin/inventory/summary').expect(401);
      await request(server()).get('/api/admin/inventory/history').expect(401);
      await request(server()).post('/api/admin/inventory/adjust').send({}).expect(401);
    });

    it('refuses customer tokens (stock changes are admin-only)', async () => {
      const read = await request(server())
        .get('/api/admin/inventory')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
      expect(read.body.message).toMatch(/permission/i);

      await request(server())
        .post('/api/admin/inventory/adjust')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: '64b7f1c2a1b2c3d4e5f60010',
          action: 'increase',
          quantity: 5,
          reason: 'new_stock',
        })
        .expect(403);
    });
  });

  describe('summary', () => {
    it('counts units, statuses and value from the product collection', async () => {
      const response = await asAdmin('get', '/api/admin/inventory/summary').expect(200);

      expect(response.body.data).toMatchObject({
        totalProducts: 5, // the archived product is excluded
        totalUnits: 12 + 5 + 0 + 1 + 40,
        inStockProducts: 2,
        lowStockProducts: 2,
        outOfStockProducts: 1,
        // 12×1500 + 5×7000 + 0 + 1×80 + 40×900 (paise → rupees below)
        inventoryValue: 12 * 150_000 + 5 * 700_000 + 1 * 8_000 + 40 * 90_000,
        retailValue: 12 * 249_900 + 5 * 899_900 + 1 * 19_900 + 40 * 129_900,
      });
      expect(response.body.data.alerts).toEqual({ low: 0, out: 0 });
      expect(response.body.data.byCategory[0]).toMatchObject({ name: 'Accessories' });
      expect(response.body.data.topLowStock).toHaveLength(2);
    });
  });

  describe('listing', () => {
    it('paginates and sorts by quantity ascending by default', async () => {
      const response = await asAdmin('get', '/api/admin/inventory?limit=2').expect(200);

      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 2,
        total: 5,
        totalPages: 3,
        hasNextPage: true,
      });
      expect(response.body.data.map((row: { stock: number }) => row.stock)).toEqual([0, 1]);
    });

    it('returns the columns the table renders', async () => {
      const response = await asAdmin(
        'get',
        '/api/admin/inventory?search=SKU-AU-1001',
      ).expect(200);

      expect(response.body.data[0]).toMatchObject({
        name: 'Wireless Headphones',
        sku: 'SKU-AU-1001',
        categoryName: 'Audio',
        price: 249_900,
        costPrice: 150_000,
        stock: 12,
        lowStockThreshold: 3,
        stockStatus: 'in',
        imageUrl: 'https://cdn.example.com/headphones.jpg',
      });
      expect(response.body.data[0].updatedAt).toBeTruthy();
    });

    it('searches by name and by SKU', async () => {
      const byName = await asAdmin('get', '/api/admin/inventory?search=monitor').expect(200);
      expect(byName.body.meta.total).toBe(1);
      expect(byName.body.data[0].sku).toBe('SKU-MON-2001');

      const bySku = await asAdmin('get', '/api/admin/inventory?search=sku-cab').expect(200);
      expect(bySku.body.meta.total).toBe(1);
      expect(bySku.body.data[0].name).toBe('USB-C Cable');
    });

    it('filters by category and by stock status', async () => {
      const audio = await asAdmin(
        'get',
        `/api/admin/inventory?categoryId=${AUDIO_ID}`,
      ).expect(200);
      expect(audio.body.meta.total).toBe(2);

      const low = await asAdmin('get', '/api/admin/inventory?stockStatus=low').expect(200);
      expect(low.body.meta.total).toBe(2);
      expect(
        low.body.data.every(
          (row: { stock: number; lowStockThreshold: number }) =>
            row.stock > 0 && row.stock <= row.lowStockThreshold,
        ),
      ).toBe(true);

      const out = await asAdmin('get', '/api/admin/inventory?stockStatus=out').expect(200);
      expect(out.body.meta.total).toBe(1);
      expect(out.body.data[0].stock).toBe(0);
    });

    it('sorts by name when asked', async () => {
      const response = await asAdmin(
        'get',
        '/api/admin/inventory?sortBy=name&sortOrder=desc&limit=1',
      ).expect(200);

      expect(response.body.data[0].name).toBe('Wireless Headphones');
    });

    it('rejects invalid filters instead of silently ignoring them', async () => {
      await asAdmin('get', '/api/admin/inventory?stockStatus=broken').expect(400);
      await asAdmin('get', '/api/admin/inventory?sortBy=password').expect(400);
      await asAdmin('get', '/api/admin/inventory?categoryId=not-an-id').expect(400);
      await asAdmin('get', '/api/admin/inventory?limit=500').expect(400);
    });

    it('serves low-stock and out-of-stock views', async () => {
      const low = await asAdmin('get', '/api/admin/inventory/low-stock').expect(200);
      expect(low.body.meta.total).toBe(2);
      expect(low.body.data.every((row: { stockStatus: string }) => row.stockStatus === 'low')).toBe(
        true,
      );

      const out = await asAdmin('get', '/api/admin/inventory/out-of-stock').expect(200);
      expect(out.body.meta.total).toBe(1);
      expect(out.body.data[0].name).toBe('Desk Lamp');
    });
  });

  describe('adjustments', () => {
    it('increases stock and writes an audited movement', async () => {
      const headphones = products.all().find((p) => p.sku === 'SKU-AU-1001')!;

      const response = await asAdmin('post', '/api/admin/inventory/adjust')
        .send({
          productId: headphones.id,
          action: 'increase',
          quantity: 5,
          reason: 'new_stock',
          notes: 'Supplier delivery #482',
        })
        .expect(201);

      expect(response.body.data).toMatchObject({
        previousQuantity: 12,
        newQuantity: 17,
        changedQuantity: 5,
        stockStatus: 'in',
      });
      expect(response.body.data.movement).toMatchObject({
        type: 'adjustment',
        direction: 'increase',
        reason: 'new_stock',
        notes: 'Supplier delivery #482',
        previousQuantity: 12,
        newQuantity: 17,
        performedBy: { email: ADMIN.email },
      });

      const fresh = await asAdmin(
        'get',
        `/api/admin/products?search=SKU-AU-1001`,
      ).expect(200);
      expect(fresh.body.data[0].stock).toBe(17);
    });

    it('decreases stock for damage', async () => {
      const keyboard = products.all().find((p) => p.sku === 'SKU-KEY-4001')!;

      const response = await asAdmin('post', '/api/admin/inventory/adjust')
        .send({
          productId: keyboard.id,
          action: 'decrease',
          quantity: 3,
          reason: 'damaged',
        })
        .expect(201);

      expect(response.body.data).toMatchObject({
        previousQuantity: 40,
        newQuantity: 37,
        changedQuantity: -3,
      });
      expect(response.body.data.movement.direction).toBe('decrease');
    });

    it('sets an exact quantity after a stock count', async () => {
      const cable = products.all().find((p) => p.sku === 'SKU-CAB-3001')!;

      const response = await asAdmin('post', '/api/admin/inventory/adjust')
        .send({
          productId: cable.id,
          action: 'set',
          quantity: 9,
          reason: 'manual_correction',
        })
        .expect(201);

      expect(response.body.data).toMatchObject({
        previousQuantity: 1,
        newQuantity: 9,
        changedQuantity: 8,
        stockStatus: 'in',
      });
    });

    it('never allows stock to go negative', async () => {
      const cable = products.all().find((p) => p.sku === 'SKU-CAB-3001')!;

      const response = await asAdmin('post', '/api/admin/inventory/adjust')
        .send({
          productId: cable.id,
          action: 'decrease',
          quantity: 5,
          reason: 'damaged',
        })
        .expect(409);

      expect(response.body.message).toMatch(/1 unit/i);

      const fresh = await asAdmin(
        'get',
        `/api/admin/inventory/products/${cable.id}`,
      ).expect(200);
      expect(fresh.body.data.quantity).toBe(1);
    });

    it('validates the payload', async () => {
      const lamp = products.all().find((p) => p.sku === 'SKU-LMP-3001')!;

      await asAdmin('post', '/api/admin/inventory/adjust')
        .send({ productId: lamp.id, action: 'decrease', quantity: 0, reason: 'damaged' })
        .expect(400);

      await asAdmin('post', '/api/admin/inventory/adjust')
        .send({ productId: lamp.id, action: 'increase', quantity: 2, reason: 'because' })
        .expect(400);

      await asAdmin('post', '/api/admin/inventory/adjust')
        .send({ productId: lamp.id, action: 'replace', quantity: 2, reason: 'other' })
        .expect(400);

      await asAdmin('post', '/api/admin/inventory/adjust')
        .send({ productId: lamp.id, action: 'increase', quantity: 2, reason: 'other', stock: 4 })
        .expect(400);
    });

    it('404s for an unknown product', async () => {
      await asAdmin('post', '/api/admin/inventory/adjust')
        .send({
          productId: '64b7f1c2a1b2c3d4e5f60718',
          action: 'increase',
          quantity: 1,
          reason: 'other',
        })
        .expect(404);
    });

    it('applies an idempotent adjustment once per reference id', async () => {
      const keyboard = products.all().find((p) => p.sku === 'SKU-KEY-4001')!;
      const payload = {
        productId: keyboard.id,
        action: 'increase',
        quantity: 10,
        reason: 'new_stock',
        referenceId: 'stock-count-2026-11-04',
      };

      await asAdmin('post', '/api/admin/inventory/adjust').send(payload).expect(201);
      await asAdmin('post', '/api/admin/inventory/adjust').send(payload).expect(409);

      const fresh = await asAdmin(
        'get',
        `/api/admin/inventory/products/${keyboard.id}`,
      ).expect(200);
      expect(fresh.body.data.quantity).toBe(50);
    });

    it('is safe under concurrent decrements (no overselling)', async () => {
      // A product with exactly 5 units, then 10 simultaneous write-offs.
      const target = products.seed({
        name: 'Limited Edition Print',
        slug: 'limited-edition-print',
        description: 'Only five exist.',
        sku: 'SKU-LIM-5001',
        categoryId: ACCESSORIES_ID,
        price: 199_900,
        costPrice: 120_000,
        stock: 5,
        lowStockThreshold: 2,
        status: 'published',
        isFeatured: false,
        images: [],
      });

      const attempts = await Promise.all(
        Array.from({ length: 10 }, () =>
          asAdmin('post', '/api/admin/inventory/adjust').send({
            productId: target.id,
            action: 'decrease',
            quantity: 1,
            reason: 'damaged',
          }),
        ),
      );

      const statuses = attempts.map((attempt) => attempt.status).sort();
      expect(statuses.filter((status) => status === 201)).toHaveLength(5);
      expect(statuses.filter((status) => status === 409)).toHaveLength(5);

      const fresh = await asAdmin(
        'get',
        `/api/admin/inventory/products/${target.id}`,
      ).expect(200);
      expect(fresh.body.data.quantity).toBe(0);
    });
  });

  describe('alerts', () => {
    it('opens one low-stock alert and updates it in place', async () => {
      const keyboard = products.all().find((p) => p.sku === 'SKU-KEY-4001')!;
      const adjust = (quantity: number) =>
        asAdmin('post', '/api/admin/inventory/adjust')
          .send({ productId: keyboard.id, action: 'set', quantity, reason: 'manual_correction' })
          .expect(201);

      await adjust(8);
      await adjust(6);

      const alerts = await asAdmin('get', '/api/admin/inventory/alerts').expect(200);
      expect(alerts.body.data).toHaveLength(1);
      expect(alerts.body.data[0]).toMatchObject({ level: 'low', quantity: 6 });

      const summary = await asAdmin('get', '/api/admin/inventory/summary').expect(200);
      expect(summary.body.data.alerts).toEqual({ low: 1, out: 0 });
    });

    it('escalates to an out-of-stock alert without duplicating it', async () => {
      const keyboard = products.all().find((p) => p.sku === 'SKU-KEY-4001')!;

      await asAdmin('post', '/api/admin/inventory/adjust')
        .send({ productId: keyboard.id, action: 'set', quantity: 1, reason: 'manual_correction' })
        .expect(201);

      const response = await asAdmin('post', '/api/admin/inventory/adjust')
        .send({ productId: keyboard.id, action: 'set', quantity: 0, reason: 'damaged' })
        .expect(201);

      expect(response.body.data.alert).toEqual({ level: 'out', created: true });

      const alerts = await asAdmin('get', '/api/admin/inventory/alerts').expect(200);
      expect(alerts.body.data).toHaveLength(1);
      expect(alerts.body.data[0].level).toBe('out');

      const outOnly = await asAdmin(
        'get',
        '/api/admin/inventory/alerts?level=out',
      ).expect(200);
      expect(outOnly.body.data).toHaveLength(1);
    });

    it('re-evaluates alerts when the threshold changes', async () => {
      const headphones = products.all().find((p) => p.sku === 'SKU-AU-1001')!;

      // 12 units is healthy at a threshold of 3…
      await asAdmin('patch', `/api/admin/products/${headphones.id}`)
        .send({ lowStockThreshold: 20 })
        .expect(200);

      // …but low once the threshold is raised to 20.
      const alerts = await asAdmin('get', '/api/admin/inventory/alerts').expect(200);
      expect(alerts.body.data).toEqual([
        expect.objectContaining({ productId: headphones.id, level: 'low' }),
      ]);
    });

    it('refuses to change stock through the product endpoints', async () => {
      const headphones = products.all().find((p) => p.sku === 'SKU-AU-1001')!;

      await asAdmin('patch', `/api/admin/products/${headphones.id}`)
        .send({ stock: 500 })
        .expect(400);

      const fresh = await asAdmin(
        'get',
        `/api/admin/inventory/products/${headphones.id}`,
      ).expect(200);
      expect(fresh.body.data.quantity).toBe(12);
    });
  });

  describe('history', () => {
    it('records every adjustment with before/after values and the admin', async () => {
      const monitor = products.all().find((p) => p.sku === 'SKU-MON-2001')!;

      await asAdmin('post', '/api/admin/inventory/adjust')
        .send({ productId: monitor.id, action: 'decrease', quantity: 2, reason: 'damaged' })
        .expect(201);
      await asAdmin('post', '/api/admin/inventory/adjust')
        .send({ productId: monitor.id, action: 'increase', quantity: 4, reason: 'new_stock' })
        .expect(201);

      const response = await asAdmin('get', '/api/admin/inventory/history').expect(200);

      expect(response.body.meta.total).toBe(2);
      expect(response.body.data[0]).toMatchObject({
        productName: 'Studio Monitor',
        sku: 'SKU-MON-2001',
        type: 'adjustment',
        direction: 'increase',
        previousQuantity: 3,
        changedQuantity: 4,
        newQuantity: 7,
        performedBy: { email: ADMIN.email },
      });
      // Newest first.
      expect(response.body.data[1].newQuantity).toBe(3);
    });

    it('filters by type, product and search term', async () => {
      const monitor = products.all().find((p) => p.sku === 'SKU-MON-2001')!;
      await asAdmin('post', '/api/admin/inventory/adjust')
        .send({ productId: monitor.id, action: 'increase', quantity: 1, reason: 'new_stock' })
        .expect(201);

      const byType = await asAdmin(
        'get',
        '/api/admin/inventory/history?type=adjustment',
      ).expect(200);
      expect(byType.body.meta.total).toBe(1);

      const byProduct = await asAdmin(
        'get',
        `/api/admin/inventory/history?productId=${monitor.id}`,
      ).expect(200);
      expect(byProduct.body.meta.total).toBe(1);

      const bySearch = await asAdmin(
        'get',
        '/api/admin/inventory/history?search=SKU-MON',
      ).expect(200);
      expect(bySearch.body.meta.total).toBe(1);

      const none = await asAdmin(
        'get',
        `/api/admin/inventory/history?type=order`,
      ).expect(200);
      expect(none.body.meta.total).toBe(0);
    });

    it('logs opening stock when a product is created', async () => {
      const response = await asAdmin('post', '/api/admin/products')
        .send({
          name: 'Wireless Earbuds',
          categoryId: AUDIO_ID,
          description: 'Compact earbuds with a charging case.',
          sku: 'sku-au-2001',
          price: 149_900,
          costPrice: 90_000,
          stock: 7,
          lowStockThreshold: 2,
          status: 'draft',
        })
        .expect(201);

      const history = await asAdmin('get', '/api/admin/inventory/history').expect(200);
      expect(history.body.data[0]).toMatchObject({
        productId: response.body.data.id,
        type: 'initial',
        previousQuantity: 0,
        newQuantity: 7,
        performedBy: { email: ADMIN.email },
      });
    });

    it('is append-only: no route edits or deletes a movement', async () => {
      const monitor = products.all().find((p) => p.sku === 'SKU-MON-2001')!;
      const adjusted = await asAdmin('post', '/api/admin/inventory/adjust')
        .send({ productId: monitor.id, action: 'increase', quantity: 1, reason: 'new_stock' })
        .expect(201);
      const movementId = adjusted.body.data.movement.id as string;

      await asAdmin('patch', `/api/admin/inventory/history/${movementId}`).expect(404);
      await asAdmin('delete', `/api/admin/inventory/history/${movementId}`).expect(404);
      await asAdmin('patch', `/api/admin/inventory/${movementId}`).expect(404);
      await asAdmin('delete', `/api/admin/inventory/${movementId}`).expect(404);

      const history = await asAdmin('get', '/api/admin/inventory/history').expect(200);
      expect(history.body.meta.total).toBe(1);
    });
  });
});
