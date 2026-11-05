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
import { InMemoryOrdersRepository } from './support/in-memory-orders.repository.js';
import { InMemoryProductsRepository } from './support/in-memory-products.repository.js';
import { InMemoryReviewsRepository } from './support/in-memory-reviews.repository.js';
import { InMemorySessionsRepository } from './support/in-memory-sessions.repository.js';
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

const AUDIO_ID = '64b7f1c2a1b2c3d4e5f60001';

const ADDRESS = {
  recipientName: 'Asha Rao',
  phone: '+91 90000 00001',
  line1: '10 Curzon Street',
  city: 'Coimbatore',
  state: 'Tamil Nadu',
  postalCode: '641001',
  country: 'India',
};

const DELIVERY_STEPS = [
  'confirmed',
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
] as const;

describe('Reviews & ratings (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let ashaToken: string;
  let raviToken: string;
  let products: InMemoryProductsRepository;
  let orders: InMemoryOrdersRepository;
  let reviews: InMemoryReviewsRepository;
  let headphonesId: string;
  let speakerId: string;
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

  /** Places an order and walks it to `delivered` through the admin status API. */
  async function buyAndReceive(
    productId: string,
    token = ashaToken,
    quantity = 1,
  ): Promise<{ orderId: string; orderNumber: string }> {
    const created = await request(server())
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId, quantity }],
        shippingAddress: ADDRESS,
        paymentMethod: 'cod',
      })
      .expect(201);

    const orderId = created.body.data.order.id as string;

    for (const status of DELIVERY_STEPS) {
      await asAdmin('patch', `/api/admin/orders/${orderId}/status`)
        .send({ status })
        .expect(200);
    }

    return {
      orderId,
      orderNumber: created.body.data.order.orderNumber as string,
    };
  }

  function reviewBody(overrides: Record<string, unknown> = {}) {
    return {
      rating: 5,
      title: 'Excellent build quality',
      comment: 'Battery lasts two days and the noise cancelling is genuinely good.',
      ...overrides,
    };
  }

  // Returns the supertest `Test` (not a promise) so callers can chain `.expect()`.
  function submitReview(
    productId: string,
    overrides: Record<string, unknown> = {},
    token = ashaToken,
  ) {
    return request(server())
      .post(`/api/products/${productId}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send(reviewBody(overrides));
  }

  async function approve(reviewId: string): Promise<void> {
    await asAdmin('patch', `/api/admin/reviews/${reviewId}`)
      .send({ status: 'approved' })
      .expect(200);
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

    products = new InMemoryProductsRepository();
    const inventory = new InMemoryInventoryRepository(products);
    orders = new InMemoryOrdersRepository();
    reviews = new InMemoryReviewsRepository();

    app = await createTestApp({
      imports: [HardeningTestModule],
      users,
      sessions,
      products,
      categories,
      inventory,
      orders,
      reviews,
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
    reviews.reset();

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

    speakerId = products.seed({
      name: 'Desk Speaker',
      slug: 'desk-speaker',
      description: 'Compact powered speaker.',
      sku: 'SKU-AU-1002',
      categoryId: AUDIO_ID,
      price: 149_900,
      costPrice: 90_000,
      stock: 100,
      lowStockThreshold: 3,
      status: 'published',
      isFeatured: false,
      images: [],
    }).id;
  });

  describe('authorization', () => {
    it('lets anyone read reviews but not write them anonymously', async () => {
      await request(server()).get(`/api/products/${headphonesId}/reviews`).expect(200);
      await request(server())
        .get(`/api/products/${headphonesId}/reviews/summary`)
        .expect(200);

      await request(server())
        .post(`/api/products/${headphonesId}/reviews`)
        .send(reviewBody())
        .expect(401);
    });

    it('blocks customers from the moderation console', async () => {
      await request(server()).get('/api/admin/reviews').expect(401);

      await asAsha('get', '/api/admin/reviews').expect(403);
      await asAsha('get', '/api/admin/reviews/summary').expect(403);

      const review = reviews.seed({ productId: headphonesId, userId: ashaId });

      await request(server())
        .patch(`/api/admin/reviews/${review.id}`)
        .set('Authorization', `Bearer ${ashaToken}`)
        .send({ status: 'approved' })
        .expect(403);

      await request(server())
        .delete(`/api/admin/reviews/${review.id}`)
        .set('Authorization', `Bearer ${ashaToken}`)
        .expect(403);
    });
  });

  describe('verified purchase gate', () => {
    it('refuses a review from someone who never received the product', async () => {
      const eligibility = await asAsha(
        'get',
        `/api/products/${headphonesId}/reviews/eligibility`,
      ).expect(200);

      expect(eligibility.body.data).toMatchObject({
        canReview: false,
        reason: expect.stringContaining('received this product'),
      });

      const response = await submitReview(headphonesId).expect(403);
      expect(response.body.message).toContain('received this product');
      expect(reviews.all()).toHaveLength(0);
    });

    it('refuses a review when the delivered order contained a different product', async () => {
      await buyAndReceive(speakerId);

      await submitReview(headphonesId).expect(403);
      expect(reviews.all()).toHaveLength(0);
    });

    it('accepts a review once the order is delivered, storing it as pending', async () => {
      const { orderNumber } = await buyAndReceive(headphonesId);

      const eligibility = await asAsha(
        'get',
        `/api/products/${headphonesId}/reviews/eligibility`,
      ).expect(200);

      expect(eligibility.body.data).toMatchObject({
        canReview: true,
        reason: null,
        orderNumber,
      });

      const response = await submitReview(headphonesId).expect(201);

      expect(response.body.data).toMatchObject({
        rating: 5,
        ratingLabel: '5 stars',
        status: 'pending',
        statusLabel: 'Pending',
        verifiedPurchase: true,
        orderNumber,
        customerEmail: ASHA.email,
        productId: headphonesId,
        productName: 'Wireless Headphones',
      });

      // Pending reviews never reach the storefront.
      const publicList = await request(server())
        .get(`/api/products/${headphonesId}/reviews`)
        .expect(200);

      expect(publicList.body.meta.total).toBe(0);
    });

    it('keeps one review per customer per product', async () => {
      await buyAndReceive(headphonesId);
      await submitReview(headphonesId).expect(201);

      const duplicate = await submitReview(headphonesId).expect(409);
      expect(duplicate.body.message).toContain('already reviewed');

      const eligibility = await asAsha(
        'get',
        `/api/products/${headphonesId}/reviews/eligibility`,
      ).expect(200);

      expect(eligibility.body.data).toMatchObject({
        canReview: false,
        existingReviewStatus: 'pending',
      });
      expect(eligibility.body.data.existingReviewId).toBeTruthy();
      expect(reviews.all()).toHaveLength(1);
    });

    it('rejects a review body that tries to set server-owned fields', async () => {
      await buyAndReceive(headphonesId);

      // `forbidNonWhitelisted` turns any attempt to publish directly into a 400.
      await submitReview(headphonesId, { status: 'approved' }).expect(400);
      await submitReview(headphonesId, { customerEmail: 'evil@example.com' }).expect(400);
      await submitReview(headphonesId, { rating: 6 }).expect(400);
      await submitReview(headphonesId, { rating: 0 }).expect(400);
      await submitReview(headphonesId, { comment: 'too short' }).expect(400);

      expect(reviews.all()).toHaveLength(0);
    });

    it('refuses reviews for a product that is not published', async () => {
      products.seed({
        name: 'Draft Speaker',
        slug: 'draft-speaker',
        description: 'Not published yet.',
        sku: 'SKU-DRAFT-1',
        categoryId: AUDIO_ID,
        price: 99_900,
        costPrice: 50_000,
        stock: 5,
        lowStockThreshold: 2,
        status: 'draft',
        isFeatured: false,
        images: [],
      });

      await request(server()).get('/api/products/draft-speaker/reviews').expect(404);
      await request(server())
        .get('/api/products/draft-speaker/reviews/summary')
        .expect(404);
    });
  });

  describe('moderation', () => {
    it('publishes a review only after an admin approves it', async () => {
      await buyAndReceive(headphonesId);
      const created = await submitReview(headphonesId).expect(201);
      const reviewId = created.body.data.id as string;

      const queue = await asAdmin('get', '/api/admin/reviews?status=pending').expect(200);
      expect(queue.body.meta.total).toBe(1);

      await approve(reviewId);

      const publicList = await request(server())
        .get(`/api/products/${headphonesId}/reviews`)
        .expect(200);

      expect(publicList.body.meta.total).toBe(1);
      expect(publicList.body.data[0]).toMatchObject({
        rating: 5,
        ratingLabel: '5 stars',
        verifiedPurchase: true,
        title: 'Excellent build quality',
      });
      // Privacy: the shopper sees a masked name, never the email or order.
      expect(publicList.body.data[0].author).toBe('Asha R.');
      expect(JSON.stringify(publicList.body)).not.toContain(ASHA.email);
      expect(JSON.stringify(publicList.body)).not.toContain('orderNumber');

      const rating = await request(server())
        .get(`/api/products/${headphonesId}/reviews/summary`)
        .expect(200);

      expect(rating.body.data).toMatchObject({
        reviewCount: 1,
        averageRating: 5,
      });
      expect(rating.body.data.distribution[0]).toMatchObject({
        stars: 5,
        count: 1,
        percent: 100,
      });
    });

    it('requires a reason to reject and hides a rejected review', async () => {
      await buyAndReceive(headphonesId);
      const created = await submitReview(headphonesId).expect(201);
      const reviewId = created.body.data.id as string;

      const withoutReason = await asAdmin('patch', `/api/admin/reviews/${reviewId}`)
        .send({ status: 'rejected' })
        .expect(400);
      expect(withoutReason.body.message).toContain('reason');

      const rejected = await asAdmin('patch', `/api/admin/reviews/${reviewId}`)
        .send({ status: 'rejected', reason: 'Contains personal information' })
        .expect(200);

      expect(rejected.body.data).toMatchObject({
        status: 'rejected',
        statusLabel: 'Rejected',
        moderationReason: 'Contains personal information',
        moderatedBy: ADMIN.email,
      });

      const publicList = await request(server())
        .get(`/api/products/${headphonesId}/reviews`)
        .expect(200);
      expect(publicList.body.meta.total).toBe(0);

      // A rejected review still blocks a second attempt by the same customer.
      await submitReview(headphonesId).expect(409);
    });

    it('refuses to apply the same decision twice', async () => {
      await buyAndReceive(headphonesId);
      const created = await submitReview(headphonesId).expect(201);
      const reviewId = created.body.data.id as string;

      await approve(reviewId);

      const repeat = await asAdmin('patch', `/api/admin/reviews/${reviewId}`)
        .send({ status: 'approved' })
        .expect(409);
      expect(repeat.body.message).toContain('already approved');

      // Flipping a published review to rejected is allowed (and needs a reason).
      await asAdmin('patch', `/api/admin/reviews/${reviewId}`)
        .send({ status: 'rejected', reason: 'Duplicate of another review' })
        .expect(200);
    });

    it('deletes a review and reports a 404 afterwards', async () => {
      const review = reviews.seed({
        productId: headphonesId,
        userId: ashaId,
        status: 'approved',
      });

      await asAdmin('delete', `/api/admin/reviews/${review.id}`).expect(200);
      await asAdmin('get', `/api/admin/reviews/${review.id}`).expect(404);
      await asAdmin('delete', `/api/admin/reviews/${review.id}`).expect(404);
      expect(reviews.all()).toHaveLength(0);
    });

    it('404s an unknown review id', async () => {
      await asAdmin('get', '/api/admin/reviews/64b7f1c2a1b2c3d4e5f60009').expect(404);
      await asAdmin('patch', '/api/admin/reviews/64b7f1c2a1b2c3d4e5f60009')
        .send({ status: 'approved' })
        .expect(404);
    });
  });

  describe('ratings', () => {
    it('averages approved reviews only and reports the distribution', async () => {
      reviews.seed({
        productId: headphonesId,
        userId: ashaId,
        rating: 5,
        status: 'approved',
      });
      reviews.seed({
        productId: headphonesId,
        userId: raviId,
        rating: 3,
        status: 'approved',
        customerName: 'Ravi Kumar',
      });
      reviews.seed({ productId: headphonesId, userId: '64b7f1c2a1b2c3d4e5f6000a', rating: 1 });

      const summary = await request(server())
        .get(`/api/products/${headphonesId}/reviews/summary`)
        .expect(200);

      expect(summary.body.data).toMatchObject({
        reviewCount: 2,
        averageRating: 4,
      });

      const stars = Object.fromEntries(
        (summary.body.data.distribution as Array<{ stars: number; count: number; percent: number }>).map(
          (entry) => [entry.stars, entry],
        ),
      );

      expect(stars[5]).toMatchObject({ count: 1, percent: 50 });
      expect(stars[3]).toMatchObject({ count: 1, percent: 50 });
      expect(stars[1]).toMatchObject({ count: 0, percent: 0 });
    });

    it('reports a null average for a product with no approved reviews', async () => {
      const summary = await request(server())
        .get(`/api/products/${speakerId}/reviews/summary`)
        .expect(200);

      expect(summary.body.data).toMatchObject({
        reviewCount: 0,
        averageRating: null,
      });
    });

    it('filters the public list by star rating and pages it', async () => {
      for (let index = 0; index < 12; index += 1) {
        reviews.seed({
          productId: headphonesId,
          userId: `64b7f1c2a1b2c3d4e5f6${index.toString().padStart(4, '0')}`,
          rating: index % 2 === 0 ? 5 : 2,
          status: 'approved',
        });
      }

      const page = await request(server())
        .get(`/api/products/${headphonesId}/reviews?limit=5&page=2`)
        .expect(200);

      expect(page.body.data).toHaveLength(5);
      expect(page.body.meta.total).toBe(12);

      const fiveStars = await request(server())
        .get(`/api/products/${headphonesId}/reviews?rating=5`)
        .expect(200);

      expect(fiveStars.body.meta.total).toBe(6);
      expect(
        (fiveStars.body.data as Array<{ rating: number }>).every(
          (entry) => entry.rating === 5,
        ),
      ).toBe(true);
    });
  });

  describe('customer and admin lists', () => {
    it('shows a customer their own review with its moderation status', async () => {
      const review = reviews.seed({
        productId: headphonesId,
        userId: ashaId,
        customerEmail: ASHA.email,
        status: 'approved',
      });
      reviews.seed({ productId: speakerId, userId: raviId, customerEmail: RAVI.email });

      const mine = await asAsha('get', '/api/reviews/mine').expect(200);

      expect(mine.body.meta.total).toBe(1);
      expect(mine.body.data[0]).toMatchObject({
        id: review.id,
        status: 'approved',
        productName: 'Wireless Headphones',
      });
    });

    it('filters the admin queue by status, rating, product and search', async () => {
      reviews.seed({
        productId: headphonesId,
        userId: ashaId,
        customerName: 'Asha Rao',
        rating: 5,
        status: 'pending',
      });
      reviews.seed({
        productId: speakerId,
        userId: raviId,
        customerName: 'Ravi Kumar',
        rating: 2,
        status: 'approved',
        comment: 'Arrived scratched and noisy at high volume.',
      });

      const pending = await asAdmin('get', '/api/admin/reviews?status=pending').expect(200);
      expect(pending.body.data).toHaveLength(1);
      expect(pending.body.data[0].customerEmail).toBe(ASHA.email);

      const approved = await asAdmin('get', '/api/admin/reviews?status=approved').expect(200);
      expect(approved.body.data[0].productName).toBe('Desk Speaker');

      const byRating = await asAdmin('get', '/api/admin/reviews?rating=2').expect(200);
      expect(byRating.body.meta.total).toBe(1);

      const byProduct = await asAdmin(
        'get',
        `/api/admin/reviews?productId=${headphonesId}`,
      ).expect(200);
      expect(byProduct.body.meta.total).toBe(1);

      const bySearch = await asAdmin('get', '/api/admin/reviews?search=scratched').expect(200);
      expect(bySearch.body.meta.total).toBe(1);

      const noMatch = await asAdmin('get', '/api/admin/reviews?search=zzzz').expect(200);
      expect(noMatch.body.meta.total).toBe(0);

      const summary = await asAdmin('get', '/api/admin/reviews/summary').expect(200);
      expect(summary.body.data).toMatchObject({
        total: 2,
        pending: 1,
        approved: 1,
        rejected: 0,
        averageRating: 2,
      });
    });
  });
});
