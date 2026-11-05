import type { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { Role } from '../src/common/enums/role.enum.js';
import { createTestApp } from './support/create-test-app.js';
import { HardeningTestModule } from './support/hardening-test.module.js';
import { InMemorySessionsRepository } from './support/in-memory-sessions.repository.js';
import { InMemorySettingsRepository } from './support/in-memory-settings.repository.js';
import { InMemoryUsersRepository } from './support/in-memory-users.repository.js';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
  process.env.JWT_ACCESS_SECRET = 'integration-test-secret-value-32-chars-min';
  process.env.BCRYPT_ROUNDS = '4';
});

const ADMIN = { email: 'owner@example.com', password: 'Adm1nPassw0rd' };
const CUSTOMER = { email: 'customer@example.com', password: 'Str0ngPassw0rd' };

describe('Store settings (e2e)', () => {
  let app: INestApplication<App>;
  let settings: InMemorySettingsRepository;
  let adminToken: string;
  let customerToken: string;

  const server = () => app.getHttpServer();

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
      email: CUSTOMER.email,
      passwordHash: await bcrypt.hash(CUSTOMER.password, 4),
      firstName: 'Nitheesh',
      lastName: 'V',
      role: Role.Customer,
      isActive: true,
    });

    settings = new InMemorySettingsRepository();

    app = await createTestApp({
      imports: [HardeningTestModule],
      users,
      sessions,
      settings,
    });

    adminToken = await login(ADMIN.email, ADMIN.password);
    customerToken = await login(CUSTOMER.email, CUSTOMER.password);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authorization', () => {
    it('rejects anonymous reads', async () => {
      await request(server()).get('/api/admin/settings').expect(401);
    });

    it('rejects a customer token with 403', async () => {
      await request(server())
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    });
  });

  describe('GET /api/admin/settings', () => {
    it('seeds the document from the environment on first read', async () => {
      const response = await request(server())
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        storeName: 'Ecommerce26',
        currency: 'INR',
        locale: 'en-IN',
        taxRatePercent: 0,
        flatShippingCharge: 4_900,
        freeShippingThreshold: 99_900,
        codEnabled: true,
        currencyLocked: false,
        updatedBy: null,
      });
      expect(response.body.data.address).toMatchObject({
        city: 'Coimbatore',
        postalCode: '641001',
      });
    });
  });

  describe('PATCH /api/admin/settings', () => {
    it('saves identity, pricing inputs and the COD switch', async () => {
      const response = await request(server())
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          storeName: 'Ecommerce26 Store',
          supportEmail: 'care@ecommerce26.test',
          supportPhone: '+91 90000 11111',
          address: { city: 'Chennai', state: 'Tamil Nadu' },
          invoiceFooter: 'Thank you for shopping with us.',
          taxRatePercent: 5,
          flatShippingCharge: 5_900,
          freeShippingThreshold: 149_900,
          codEnabled: false,
          locale: 'en-GB',
        })
        .expect(200);

      expect(response.body.data).toMatchObject({
        storeName: 'Ecommerce26 Store',
        supportEmail: 'care@ecommerce26.test',
        taxRatePercent: 5,
        flatShippingCharge: 5_900,
        freeShippingThreshold: 149_900,
        codEnabled: false,
        locale: 'en-GB',
        // Untouched fields survive a partial patch.
        currency: 'INR',
      });
      expect(response.body.data.address.city).toBe('Chennai');
      expect(response.body.data.address.line1).toBe('1 Market Road');
      expect(response.body.data.updatedBy).toBe(ADMIN.email);
    });

    it('persists the change for the next read', async () => {
      const response = await request(server())
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.taxRatePercent).toBe(5);
      expect(response.body.data.codEnabled).toBe(false);
    });

    it('rejects an impossible tax rate', async () => {
      const response = await request(server())
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ taxRatePercent: 140 })
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });

    it('rejects a malformed currency or locale', async () => {
      await request(server())
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ currency: 'RUPEES' })
        .expect(400);

      await request(server())
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ locale: 'english' })
        .expect(400);
    });

    it('allows a currency change while the store is empty', async () => {
      const response = await request(server())
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ currency: 'usd' })
        .expect(200);

      // ISO codes are normalised, not trusted as typed.
      expect(response.body.data.currency).toBe('USD');
      expect(response.body.data.currencyLocked).toBe(false);
    });

    it('refuses a currency change once products or orders exist', async () => {
      settings.setFootprint({ products: 12, orders: 0 });

      const response = await request(server())
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ currency: 'EUR' })
        .expect(409);

      expect(response.body.message).toContain('Currency cannot change');

      // Saving anything else still works, and the lock is reported to the console.
      const allowed = await request(server())
        .patch('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ storeName: 'Ecommerce26' })
        .expect(200);

      expect(allowed.body.data.currency).toBe('USD');
      expect(allowed.body.data.currencyLocked).toBe(true);
    });
  });

  describe('GET /api/store/settings', () => {
    it('publishes only the storefront-safe subset', async () => {
      const response = await request(server()).get('/api/store/settings').expect(200);

      expect(response.body.data).toMatchObject({
        storeName: 'Ecommerce26',
        supportEmail: 'care@ecommerce26.test',
        currency: 'USD',
        locale: 'en-GB',
        codEnabled: false,
      });
      expect(response.body.data.taxRatePercent).toBeUndefined();
      expect(response.body.data.flatShippingCharge).toBeUndefined();
      expect(response.body.data.updatedBy).toBeUndefined();
    });
  });
});
