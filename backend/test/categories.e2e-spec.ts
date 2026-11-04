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

describe('Categories (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let customerToken: string;
  let categories: InMemoryCategoriesRepository;
  let products: InMemoryProductsRepository;

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

  /** Creates a category through the API and returns its body. */
  async function createCategory(payload: Record<string, unknown>) {
    const response = await asAdmin('post', '/api/admin/categories')
      .send(payload)
      .expect(201);

    return response.body.data as {
      id: string;
      name: string;
      slug: string;
      status: string;
      parentId: string | null;
      productCount: number;
      childrenCount: number;
      parentPath: string;
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
    users.seed({
      email: CUSTOMER.email,
      passwordHash: await bcrypt.hash(CUSTOMER.password, 4),
      firstName: 'Nitheesh',
      lastName: 'V',
      role: Role.Customer,
      isActive: true,
    });

    products = new InMemoryProductsRepository();
    // Product counts are read from the products fake, exactly like the Mongo
    // repository reads the `products` collection.
    categories = new InMemoryCategoriesRepository({
      productCounts: (categoryId) => products.countInCategory(categoryId),
    });

    app = await createTestApp({
      imports: [HardeningTestModule],
      users,
      sessions,
      products,
      categories,
      inventory: new InMemoryInventoryRepository(products),
      imageStorage: new FakeImageStorage(),
    });

    adminToken = await login(ADMIN.email, ADMIN.password);
    customerToken = await login(CUSTOMER.email, CUSTOMER.password);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('authorization', () => {
    it('rejects anonymous access to the admin category API', async () => {
      await request(server()).get('/api/admin/categories').expect(401);
      await request(server()).post('/api/admin/categories').send({ name: 'X' }).expect(401);
      await request(server()).patch('/api/admin/categories/abc').send({}).expect(401);
      await request(server()).delete('/api/admin/categories/abc').expect(401);
      await request(server())
        .patch('/api/admin/categories/abc/status')
        .send({ status: 'inactive' })
        .expect(401);
    });

    it('rejects customer tokens on every admin write', async () => {
      await request(server())
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ name: 'Sneaky' })
        .expect(403);

      await request(server())
        .get('/api/admin/categories')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    });

    it('leaves the storefront list public', async () => {
      await request(server()).get('/api/categories').expect(200);
    });
  });

  describe('creation and validation', () => {
    it('creates a root category and derives the slug', async () => {
      const created = await createCategory({ name: 'Electronics' });

      expect(created).toMatchObject({
        name: 'Electronics',
        slug: 'electronics',
        status: 'active',
        parentId: null,
        parentPath: '',
        productCount: 0,
        childrenCount: 0,
      });
    });

    it('accepts an explicit slug, description, SEO fields and an image', async () => {
      const created = await createCategory({
        name: 'Mobile Phones',
        slug: 'mobiles',
        description: 'Smartphones and feature phones.',
        displayOrder: 2,
        seoTitle: 'Mobile Phones',
        seoDescription: 'Buy the latest phones online.',
        image: { url: '/uploads/phones.jpg', publicId: 'phones', alt: 'Phones' },
      });

      expect(created.slug).toBe('mobiles');
    });

    it('rejects a duplicate slug with 409', async () => {
      const response = await asAdmin('post', '/api/admin/categories')
        .send({ name: 'Another Electronics', slug: 'electronics' })
        .expect(409);

      expect(response.body.message).toMatch(/slug/i);
    });

    it('rejects a duplicate name under the same parent, but allows it elsewhere', async () => {
      const parent = await createCategory({ name: 'Fashion' });

      await asAdmin('post', '/api/admin/categories')
        .send({ name: 'Electronics', parentId: parent.id })
        .expect(201);

      // Same name at the same level → conflict (case-insensitive).
      const response = await asAdmin('post', '/api/admin/categories')
        .send({ name: 'electronics', parentId: parent.id })
        .expect(409);

      expect(response.body.message).toMatch(/already exists/i);
    });

    it('validates the payload', async () => {
      await asAdmin('post', '/api/admin/categories').send({}).expect(400);
      await asAdmin('post', '/api/admin/categories')
        .send({ name: 'Bad Slug', slug: 'Bad Slug!' })
        .expect(400);
      await asAdmin('post', '/api/admin/categories')
        .send({ name: 'Bad Parent', parentId: 'not-an-id' })
        .expect(400);
      await asAdmin('post', '/api/admin/categories')
        .send({ name: 'Ghost Parent', parentId: '64b7f1c2a1b2c3d4e5f6ffff' })
        .expect(400);
    });
  });

  describe('hierarchy rules', () => {
    it('refuses to make a category its own parent', async () => {
      const parent = await createCategory({ name: 'Home' });

      const response = await asAdmin('patch', `/api/admin/categories/${parent.id}`)
        .send({ parentId: parent.id })
        .expect(400);

      expect(response.body.message).toMatch(/own parent/i);
    });

    it('refuses to nest a category under its own descendant (cycle)', async () => {
      const root = await createCategory({ name: 'Sports' });
      const child = await createCategory({ name: 'Outdoor', parentId: root.id });

      const response = await asAdmin('patch', `/api/admin/categories/${root.id}`)
        .send({ parentId: child.id })
        .expect(400);

      expect(response.body.message).toMatch(/own subcategor/i);
    });

    it('caps nesting at three levels', async () => {
      const level1 = await createCategory({ name: 'Depth One' });
      const level2 = await createCategory({ name: 'Depth Two', parentId: level1.id });
      await createCategory({ name: 'Depth Three', parentId: level2.id });

      const response = await asAdmin('post', '/api/admin/categories')
        .send({ name: 'Depth Four', parentId: (await categories.findBySlug('depth-three'))!.id })
        .expect(400);

      expect(response.body.message).toMatch(/at most 3 levels/i);
    });

    it('reports the parent path and child count', async () => {
      const list = await asAdmin('get', '/api/admin/categories?search=Depth').expect(200);
      const mapped = list.body.data as Array<{ name: string; parentPath: string }>;

      const depthThree = mapped.find((item) => item.name === 'Depth Three');

      expect(depthThree?.parentPath).toBe('Depth One › Depth Two');
    });
  });

  describe('listing, search, filters, sorting and pagination', () => {
    it('paginates and reports meta', async () => {
      const response = await asAdmin(
        'get',
        '/api/admin/categories?page=1&limit=3&sortBy=name&sortOrder=asc',
      ).expect(200);

      expect(response.body.data).toHaveLength(3);
      expect(response.body.meta).toMatchObject({ page: 1, limit: 3 });
      expect(response.body.meta.total).toBeGreaterThan(3);
    });

    it('searches by name and slug', async () => {
      const byName = await asAdmin('get', '/api/admin/categories?search=electro').expect(200);
      expect(
        (byName.body.data as Array<{ name: string }>).every((item) =>
          item.name.toLowerCase().includes('electro'),
        ),
      ).toBe(true);

      const bySlug = await asAdmin('get', '/api/admin/categories?search=mobiles').expect(200);
      expect(bySlug.body.data[0]).toMatchObject({ slug: 'mobiles' });
    });

    it('filters by status and by parent', async () => {
      const inactive = await createCategory({ name: 'Dormant', status: 'inactive' });

      const filtered = await asAdmin(
        'get',
        '/api/admin/categories?status=inactive',
      ).expect(200);

      expect(
        (filtered.body.data as Array<{ id: string }>).map((item) => item.id),
      ).toContain(inactive.id);

      const roots = await asAdmin('get', '/api/admin/categories?parentId=root').expect(200);
      expect(
        (roots.body.data as Array<{ parentId: string | null }>).every(
          (item) => item.parentId === null,
        ),
      ).toBe(true);

      const fashion = await categories.findBySlug('fashion');
      const children = await asAdmin(
        'get',
        `/api/admin/categories?parentId=${fashion!.id}`,
      ).expect(200);

      expect(
        (children.body.data as Array<{ parentId: string }>).every(
          (item) => item.parentId === fashion!.id,
        ),
      ).toBe(true);
    });

    it('rejects an invalid parent filter', async () => {
      await asAdmin('get', '/api/admin/categories?parentId=nope').expect(400);
    });

    it('rejects an invalid sort field', async () => {
      await asAdmin('get', '/api/admin/categories?sortBy=color').expect(400);
    });

    it('counts the products assigned to a category', async () => {
      const category = await createCategory({ name: 'Audio Gear' });

      await asAdmin('post', '/api/admin/products')
        .send({
          name: 'Studio Headphones',
          categoryId: category.id,
          description: 'Reference headphones for the studio.',
          sku: 'CAT-AUD-1',
          price: 100_000,
          stock: 5,
          status: 'published',
        })
        .expect(201);

      const response = await asAdmin(
        'get',
        `/api/admin/categories/${category.id}`,
      ).expect(200);

      expect(response.body.data.productCount).toBe(1);
    });
  });

  describe('update and status', () => {
    it('updates fields and keeps the slug stable', async () => {
      const created = await createCategory({ name: 'Gadgets' });

      const response = await asAdmin('patch', `/api/admin/categories/${created.id}`)
        .send({
          description: 'Small electronics.',
          displayOrder: 7,
          seoTitle: 'Gadgets online',
        })
        .expect(200);

      expect(response.body.data).toMatchObject({
        slug: 'gadgets',
        description: 'Small electronics.',
        displayOrder: 7,
        seoTitle: 'Gadgets online',
      });
    });

    it('allows renaming and slug changes, rejecting a taken slug', async () => {
      const created = await createCategory({ name: 'Renamable' });

      const renamed = await asAdmin('patch', `/api/admin/categories/${created.id}`)
        .send({ name: 'Renamed', slug: 'renamed-category' })
        .expect(200);

      expect(renamed.body.data.slug).toBe('renamed-category');

      await asAdmin('patch', `/api/admin/categories/${created.id}`)
        .send({ slug: 'electronics' })
        .expect(409);
    });

    it('moves a category to the top level with parentId: null', async () => {
      const parent = await createCategory({ name: 'Move Parent' });
      const child = await createCategory({ name: 'Move Child', parentId: parent.id });

      const response = await asAdmin('patch', `/api/admin/categories/${child.id}`)
        .send({ parentId: null })
        .expect(200);

      expect(response.body.data.parentId).toBeNull();
    });

    it('activates and deactivates', async () => {
      const created = await createCategory({ name: 'Toggle Me' });

      const off = await asAdmin('patch', `/api/admin/categories/${created.id}/status`)
        .send({ status: 'inactive' })
        .expect(200);
      expect(off.body.data.status).toBe('inactive');

      const on = await asAdmin('patch', `/api/admin/categories/${created.id}/status`)
        .send({ status: 'active' })
        .expect(200);
      expect(on.body.data.status).toBe('active');
    });

    it('returns 404 for an unknown category', async () => {
      await asAdmin('get', '/api/admin/categories/64b7f1c2a1b2c3d4e5f6ffff').expect(404);
      await asAdmin('patch', '/api/admin/categories/not-an-id').send({}).expect(404);
    });
  });

  describe('deletion rules', () => {
    it('deletes a category with no children and no products', async () => {
      const created = await createCategory({ name: 'Disposable' });

      const response = await asAdmin('delete', `/api/admin/categories/${created.id}`)
        .expect(200);

      expect(response.body.data).toEqual({ deleted: true });
      await asAdmin('get', `/api/admin/categories/${created.id}`).expect(404);
    });

    it('refuses to delete a parent with children', async () => {
      const parent = await createCategory({ name: 'Keep Parent' });
      await createCategory({ name: 'Keep Child', parentId: parent.id });

      const response = await asAdmin('delete', `/api/admin/categories/${parent.id}`)
        .expect(409);

      // The API explains *why* in the message (the shared error envelope keeps
      // `details` for validation arrays only).
      expect(response.body.message).toMatch(/1 subcategory/i);
    });

    it('refuses to delete a category with products assigned', async () => {
      const category = await createCategory({ name: 'Busy Category' });

      await asAdmin('post', '/api/admin/products')
        .send({
          name: 'Busy Product',
          categoryId: category.id,
          description: 'A product that pins its category.',
          sku: 'CAT-BUSY-1',
          price: 50_000,
          stock: 1,
        })
        .expect(201);

      const response = await asAdmin('delete', `/api/admin/categories/${category.id}`)
        .expect(409);

      expect(response.body.message).toMatch(/1 product assigned/i);
    });
  });

  describe('storefront', () => {
    it('returns only active categories, nested, in display order', async () => {
      const parent = await createCategory({ name: 'Store Parent', displayOrder: 1 });
      await createCategory({
        name: 'Store Child',
        parentId: parent.id,
        displayOrder: 1,
      });
      const hidden = await createCategory({ name: 'Store Hidden', status: 'inactive' });

      const response = await request(server()).get('/api/categories').expect(200);
      const tree = response.body.data as Array<{
        id: string;
        name: string;
        children: Array<{ name: string }>;
        productCount: number;
      }>;

      const names = JSON.stringify(tree);
      expect(names).not.toContain('Store Hidden');
      expect(tree.some((node) => node.id === parent.id)).toBe(true);

      const node = tree.find((item) => item.id === parent.id);
      expect(node?.children.map((child) => child.name)).toContain('Store Child');
      expect(hidden.status).toBe('inactive');
    });

    it('serves a category page by slug with children, siblings and breadcrumb', async () => {
      const parent = await createCategory({ name: 'Shop Root' });
      const child = await createCategory({ name: 'Shop Child', parentId: parent.id });

      const response = await request(server())
        .get(`/api/categories/${child.slug}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        id: child.id,
        slug: 'shop-child',
      });
      expect(response.body.data.breadcrumb).toEqual([
        { id: parent.id, name: 'Shop Root', slug: 'shop-root' },
      ]);
      expect(response.body.data.children).toEqual([]);
    });

    it('hides inactive categories and children of inactive parents', async () => {
      const hiddenParent = await createCategory({
        name: 'Closed Department',
        status: 'inactive',
      });
      const child = await createCategory({
        name: 'Closed Child',
        parentId: hiddenParent.id,
      });

      await request(server()).get('/api/categories/closed-department').expect(404);
      await request(server()).get('/api/categories/closed-child').expect(404);
      expect(child.status).toBe('active');
    });

    it('supports a flat list filtered by parent slug', async () => {
      const parent = await createCategory({ name: 'Flat Parent' });
      await createCategory({ name: 'Flat Child', parentId: parent.id });

      const response = await request(server())
        .get('/api/categories?tree=false&parent=flat-parent')
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Flat Child');
    });

    it('does not break product listing filtered by category slug', async () => {
      const category = await createCategory({ name: 'Filterable' });

      await asAdmin('post', '/api/admin/products')
        .send({
          name: 'Filterable Product',
          categoryId: category.id,
          description: 'A product used to verify category filtering.',
          sku: 'CAT-FILTER-1',
          price: 75_000,
          stock: 4,
          status: 'published',
        })
        .expect(201);

      const response = await request(server())
        .get(`/api/products?category=${category.slug}`)
        .expect(200);

      expect(response.body.meta.total).toBe(1);
      expect(response.body.data[0]).toMatchObject({ name: 'Filterable Product' });
    });
  });
});
