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

/** Assigned in `beforeAll` once the seeded category exists. */
let defaultCategoryId = '';

const validProduct = (overrides: Record<string, unknown> = {}) => ({
  name: 'Wireless Head phones',
  categoryId: defaultCategoryId,
  description: 'Studio-grade wireless headphones with active noise cancelling.',
  sku: 'sku-au-1001',
  price: 249_900,
  salePrice: 199_900,
  costPrice: 150_000,
  stock: 12,
  lowStockThreshold: 3,
  status: 'draft',
  ...overrides,
});

describe('Products (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let customerToken: string;
  let products: InMemoryProductsRepository;
  let categories: InMemoryCategoriesRepository;
  let storage: FakeImageStorage;
  let audioCategoryId: string;
  let inactiveCategoryId: string;

  const server = () => app.getHttpServer();

  async function login(email: string, password: string): Promise<string> {
    const response = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.data.accessToken as string;
  }

  const asAdmin = (method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    request(server())[method](url).set('Authorization', `Bearer ${adminToken}`);

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
    // Real ObjectId-shaped ids: the DTO validates `categoryId` with @IsMongoId.
    audioCategoryId = categories.seed({
      id: '64b7f1c2a1b2c3d4e5f60001',
      name: 'Audio',
      slug: 'audio',
    }).id;
    defaultCategoryId = audioCategoryId;
    inactiveCategoryId = categories.seed({
      id: '64b7f1c2a1b2c3d4e5f60002',
      name: 'Legacy',
      slug: 'legacy',
      status: 'inactive',
    }).id;

    products = new InMemoryProductsRepository();
    storage = new FakeImageStorage();

    app = await createTestApp({
      imports: [HardeningTestModule],
      users,
      sessions,
      products,
      categories,
      imageStorage: storage,
    });

    adminToken = await login(ADMIN.email, ADMIN.password);
    customerToken = await login(CUSTOMER.email, CUSTOMER.password);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('authorization', () => {
    it('rejects anonymous writes', async () => {
      await request(server()).post('/api/admin/products').send(validProduct()).expect(401);
      await request(server()).get('/api/admin/products').expect(401);
      await request(server()).patch('/api/admin/products/abc').send({}).expect(401);
      await request(server()).delete('/api/admin/products/abc').expect(401);
      await request(server()).post('/api/admin/uploads/images').expect(401);
    });

    it('rejects customer tokens on admin routes', async () => {
      const response = await request(server())
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(validProduct())
        .expect(403);

      expect(response.body.message).toMatch(/permission/i);
    });

    it('rejects customer tokens on the image upload endpoint', async () => {
      await request(server())
        .post('/api/admin/uploads/images')
        .set('Authorization', `Bearer ${customerToken}`)
        .attach('file', Buffer.from('fake'), { filename: 'a.png', contentType: 'image/png' })
        .expect(403);
    });
  });

  describe('creation and validation', () => {
    it('creates a product, deriving a slug and normalising the SKU', async () => {
      const response = await asAdmin('post', '/api/admin/products')
        .send(validProduct())
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: 'Wireless Head phones',
        slug: 'wireless-head-phones',
        sku: 'SKU-AU-1001',
        price: 249_900,
        salePrice: 199_900,
        costPrice: 150_000,
        status: 'draft',
        stockStatus: 'in',
        effectivePrice: 199_900,
      });
      expect(response.body.data.category).toMatchObject({ id: audioCategoryId, name: 'Audio' });
    });

    it('rejects a sale price that is not below the regular price', async () => {
      const response = await asAdmin('post', '/api/admin/products')
        .send(validProduct({ sku: 'SKU-BAD-1', salePrice: 249_900 }))
        .expect(400);

      expect(response.body.message).toMatch(/lower than the regular price/i);
    });

    it('rejects negative prices and stock at the DTO layer', async () => {
      await asAdmin('post', '/api/admin/products')
        .send(validProduct({ sku: 'SKU-BAD-2', price: -100 }))
        .expect(400);

      await asAdmin('post', '/api/admin/products')
        .send(validProduct({ sku: 'SKU-BAD-3', stock: -1 }))
        .expect(400);
    });

    it('rejects an unknown category', async () => {
      const response = await asAdmin('post', '/api/admin/products')
        .send(validProduct({ sku: 'SKU-BAD-4', categoryId: '64b7f1c2a1b2c3d4e5f60718' }))
        .expect(400);

      expect(response.body.message).toMatch(/category does not exist/i);
    });

    it('refuses to publish into an inactive category', async () => {
      const response = await asAdmin('post', '/api/admin/products')
        .send(validProduct({ sku: 'SKU-BAD-5', categoryId: inactiveCategoryId, status: 'published' }))
        .expect(400);

      expect(response.body.message).toMatch(/inactive/i);
    });

    it('rejects a duplicate SKU (case-insensitive)', async () => {
      const response = await asAdmin('post', '/api/admin/products')
        .send(validProduct({ sku: 'sku-au-1001' }))
        .expect(409);

      expect(response.body.message).toMatch(/already exists/i);
    });

    it('rejects a duplicate explicit slug', async () => {
      const response = await asAdmin('post', '/api/admin/products')
        .send(
          validProduct({
            sku: 'SKU-AU-1002',
            slug: 'wireless-head-phones',
          }),
        )
        .expect(409);

      expect(response.body.message).toMatch(/slug/i);
    });

    it('suffixes a generated slug instead of failing', async () => {
      const response = await asAdmin('post', '/api/admin/products')
        .send(validProduct({ sku: 'SKU-AU-1003' }))
        .expect(201);

      expect(response.body.data.slug).toBe('wireless-head-phones-2');
    });
  });

  describe('listing, search, filters, sorting and pagination', () => {
    beforeAll(async () => {
      await asAdmin('post', '/api/admin/products')
        .send(
          validProduct({
            name: 'Studio Monitor',
            sku: 'SKU-MON-2001',
            price: 899_900,
            salePrice: null,
            stock: 0,
            status: 'published',
          }),
        )
        .expect(201);

      await asAdmin('post', '/api/admin/products')
        .send(
          validProduct({
            name: 'Desk Lamp',
            sku: 'SKU-LMP-3001',
            price: 49_900,
            salePrice: null,
            stock: 2,
            lowStockThreshold: 5,
            status: 'published',
          }),
        )
        .expect(201);
    });

    it('returns a paginated envelope with metadata', async () => {
      const response = await asAdmin('get', '/api/admin/products?page=1&limit=2').expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 2,
        total: 4,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      });
    });

    it('searches name, SKU and slug', async () => {
      const byName = await asAdmin('get', '/api/admin/products?search=monitor').expect(200);
      expect(byName.body.data).toHaveLength(1);
      expect(byName.body.data[0].name).toBe('Studio Monitor');

      const bySku = await asAdmin('get', '/api/admin/products?search=SKU-LMP').expect(200);
      expect(bySku.body.data).toHaveLength(1);
      expect(bySku.body.data[0].sku).toBe('SKU-LMP-3001');
    });

    it('filters by status and category', async () => {
      const published = await asAdmin('get', '/api/admin/products?status=published').expect(200);
      expect(published.body.meta.total).toBe(2);

      const drafts = await asAdmin('get', '/api/admin/products?status=draft').expect(200);
      expect(drafts.body.meta.total).toBe(2);

      const byCategory = await asAdmin(
        'get',
        `/api/admin/products?category=${audioCategoryId}`,
      ).expect(200);
      expect(byCategory.body.meta.total).toBe(4);
    });

    it('filters by stock availability', async () => {
      const out = await asAdmin('get', '/api/admin/products?stockStatus=out').expect(200);
      expect(out.body.meta.total).toBe(1);
      expect(out.body.data[0].sku).toBe('SKU-MON-2001');

      const low = await asAdmin('get', '/api/admin/products?stockStatus=low').expect(200);
      expect(low.body.meta.total).toBe(1);
      expect(low.body.data[0].sku).toBe('SKU-LMP-3001');

      const inStock = await asAdmin('get', '/api/admin/products?stockStatus=in').expect(200);
      expect(inStock.body.meta.total).toBe(3);
    });

    it('sorts by price ascending', async () => {
      const response = await asAdmin(
        'get',
        '/api/admin/products?sortBy=price&sortOrder=asc',
      ).expect(200);

      const prices = response.body.data.map((item: { price: number }) => item.price);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    });

    it('rejects invalid query parameters', async () => {
      await asAdmin('get', '/api/admin/products?sortBy=password').expect(400);
      await asAdmin('get', '/api/admin/products?limit=500').expect(400);
      await asAdmin('get', '/api/admin/products?category=not-an-id').expect(400);
    });
  });

  describe('read, update and status', () => {
    it('returns a single product for admins', async () => {
      const list = await asAdmin('get', '/api/admin/products?search=SKU-MON-2001').expect(200);
      const id = list.body.data[0].id as string;

      const response = await asAdmin('get', `/api/admin/products/${id}`).expect(200);
      expect(response.body.data.id).toBe(id);
      expect(response.body.data.costPrice).toBe(150_000);
    });

    it('returns 404 for an unknown id', async () => {
      await asAdmin('get', '/api/admin/products/64b7f1c2a1b2c3d4e5f60718').expect(404);
    });

    it('updates fields and re-validates pricing against the stored value', async () => {
      const list = await asAdmin('get', '/api/admin/products?search=SKU-LMP-3001').expect(200);
      const id = list.body.data[0].id as string;

      const updated = await asAdmin('patch', `/api/admin/products/${id}`)
        .send({ name: 'Desk Lamp Pro', stock: 25, salePrice: 39_900 })
        .expect(200);

      expect(updated.body.data).toMatchObject({ name: 'Desk Lamp Pro', stock: 25 });
      expect(updated.body.data.stockStatus).toBe('in');

      // salePrice must stay below the *existing* price (49900), not a payload value
      await asAdmin('patch', `/api/admin/products/${id}`)
        .send({ salePrice: 49_900 })
        .expect(400);
    });

    it('publishes and unpublishes through the status endpoint', async () => {
      const list = await asAdmin('get', '/api/admin/products?search=SKU-AU-1001').expect(200);
      const id = list.body.data[0].id as string;

      const published = await asAdmin('patch', `/api/admin/products/${id}/status`)
        .send({ status: 'published' })
        .expect(200);
      expect(published.body.data.status).toBe('published');

      const archived = await asAdmin('patch', `/api/admin/products/${id}/status`)
        .send({ status: 'archived' })
        .expect(200);
      expect(archived.body.data.status).toBe('archived');

      await asAdmin('patch', `/api/admin/products/${id}/status`)
        .send({ status: 'deleted' })
        .expect(400);
    });
  });

  describe('public storefront API', () => {
    it('lists only published products and never exposes cost price', async () => {
      const response = await request(server()).get('/api/products?limit=50').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      for (const product of response.body.data) {
        expect(product.status).toBeUndefined();
        expect(product.costPrice).toBeUndefined();
        expect(product.category).toMatchObject({ name: 'Audio' });
      }
    });

    it('resolves a product by slug and hides drafts', async () => {
      await request(server()).get('/api/products/desk-lamp').expect(200);

      const draft = await request(server())
        .get('/api/products/wireless-head-phones-2')
        .expect(404);
      expect(draft.body.message).toMatch(/not found/i);
    });

    it('filters by category slug and returns an empty page for unknown slugs', async () => {
      const known = await request(server()).get('/api/products?category=audio').expect(200);
      expect(known.body.meta.total).toBeGreaterThan(0);

      const unknown = await request(server()).get('/api/products?category=nope').expect(200);
      expect(unknown.body.data).toEqual([]);
      expect(unknown.body.meta.total).toBe(0);
    });
  });

  describe('deletion', () => {
    it('deletes a product that has no order history', async () => {
      const created = await asAdmin('post', '/api/admin/products')
        .send(validProduct({ name: 'Temporary Item', sku: 'SKU-TMP-9001' }))
        .expect(201);

      const id = created.body.data.id as string;

      const response = await asAdmin('delete', `/api/admin/products/${id}`).expect(200);
      expect(response.body.data).toMatchObject({ deleted: true, archived: false });
      expect(await products.findById(id)).toBeNull();
    });

    it('archives instead of deleting when orders reference the product', async () => {
      const created = await asAdmin('post', '/api/admin/products')
        .send(validProduct({ name: 'Sold Item', sku: 'SKU-SLD-9002', status: 'published' }))
        .expect(201);

      const id = created.body.data.id as string;
      products.addOrderReference(id, 3);

      const response = await asAdmin('delete', `/api/admin/products/${id}`).expect(200);
      expect(response.body.data).toMatchObject({
        deleted: false,
        archived: true,
        referencedOrders: 3,
      });

      const stored = await products.findById(id);
      expect(stored?.status).toBe('archived');
    });

    it('returns 404 when deleting an unknown product', async () => {
      await asAdmin('delete', '/api/admin/products/64b7f1c2a1b2c3d4e5f60718').expect(404);
    });
  });

  describe('image upload', () => {
    it('stores an image through the configured provider', async () => {
      const response = await asAdmin('post', '/api/admin/uploads/images')
        .attach('file', Buffer.from('fake-png-bytes'), {
          filename: 'shot.png',
          contentType: 'image/png',
        })
        .expect(201);

      expect(response.body.data).toMatchObject({ provider: 'local' });
      expect(response.body.data.url).toMatch(/^\/uploads\//);
      expect(storage.uploads).toHaveLength(1);
    });

    it('rejects a non-image upload', async () => {
      const response = await asAdmin('post', '/api/admin/uploads/images')
        .attach('file', Buffer.from('%PDF-1.7'), {
          filename: 'invoice.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);

      expect(response.body.message).toMatch(/unsupported image type/i);
    });

    it('rejects a request without a file', async () => {
      await asAdmin('post', '/api/admin/uploads/images').expect(400);
    });
  });

  /**
   * The admin console binds directly to these fields, so the shape is a contract:
   * a rename here silently blanks a column in the UI.
   */
  describe('admin view contract', () => {
    it('returns list items with the fields the product table renders', async () => {
      const response = await asAdmin('get', '/api/admin/products?limit=1').expect(200);

      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 1,
        total: expect.any(Number),
        totalPages: expect.any(Number),
        hasNextPage: expect.any(Boolean),
        hasPreviousPage: expect.any(Boolean),
      });

      // Optional fields (brand, SEO, short description) are omitted when unset,
      // so this asserts the required subset rather than an exact key set.
      expect(Object.keys(response.body.data[0]).sort()).toEqual(
        expect.arrayContaining([
          'category',
          'categoryId',
          'costPrice',
          'createdAt',
          'description',
          'effectivePrice',
          'id',
          'images',
          'isFeatured',
          'lowStockThreshold',
          'name',
          'price',
          'salePrice',
          'sku',
          'slug',
          'status',
          'stock',
          'stockStatus',
          'updatedAt',
        ]),
      );
    });

    it('returns a detail payload with category, stock status and ordered images', async () => {
      const created = await asAdmin('post', '/api/admin/products')
        .send(
          validProduct({
            name: 'Detail Contract Speaker',
            sku: 'CONTRACT-SPK-1',
            status: 'published',
            stock: 0,
            images: [
              { url: 'https://cdn.example.com/front.jpg', isPrimary: false },
              { url: 'https://cdn.example.com/side.jpg', isPrimary: true },
            ],
          }),
        )
        .expect(201);

      const id = created.body.data.id as string;
      const response = await asAdmin('get', `/api/admin/products/${id}`).expect(200);
      const product = response.body.data;

      expect(product.category).toMatchObject({ id: audioCategoryId, name: expect.any(String) });
      expect(product.stockStatus).toBe('out');
      expect(product.effectivePrice).toBe(199_900);
      // Exactly one primary image, and order is preserved for the gallery.
      expect(product.images.map((image: { isPrimary: boolean }) => image.isPrimary)).toEqual([
        false,
        true,
      ]);
    });
  });
});
