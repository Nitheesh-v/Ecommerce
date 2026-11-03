import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { configureApp } from '../src/app.setup.js';
import type { ValidatedEnv } from '../src/config/env.validation.js';
import { HardeningTestModule } from './support/hardening-test.module.js';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
});

/**
 * Cross-cutting behaviour of the application: security headers, request
 * correlation, the success envelope, and the single error shape.
 */
describe('Hardening (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [HardeningTestModule],
    })
      .overrideProvider(getConnectionToken())
      .useValue({
        readyState: 1,
        name: 'ecommerce-test',
        host: '127.0.0.1',
        close: async () => undefined,
      })
      .compile();

    app = moduleFixture.createNestApplication<INestApplication<App>>();
    configureApp(app, app.get<ConfigService<ValidatedEnv, true>>(ConfigService), {
      swagger: false,
      cors: false,
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('security headers', () => {
    it('sets helmet headers on API responses', async () => {
      const response = await request(app.getHttpServer()).get('/api/health').expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
      expect(response.headers['referrer-policy']).toBe('no-referrer');
    });
  });

  describe('request correlation', () => {
    it('generates an x-request-id when the caller does not send one', async () => {
      const response = await request(app.getHttpServer()).get('/api/health').expect(200);

      expect(response.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('reuses an inbound x-request-id and reports it in error bodies', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/not-a-route')
        .set('x-request-id', 'caller-supplied-id')
        .expect(404);

      expect(response.headers['x-request-id']).toBe('caller-supplied-id');
      expect(response.body.requestId).toBe('caller-supplied-id');
    });
  });

  describe('success envelope', () => {
    it('wraps handler results in { success, data }', async () => {
      const response = await request(app.getHttpServer()).get('/api').expect(200);

      expect(response.body).toEqual({ success: true, data: 'Hello World!' });
    });

    it('leaves infrastructure endpoints unwrapped', async () => {
      const response = await request(app.getHttpServer()).get('/api/health').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).not.toHaveProperty('data');
      expect(response.body.message).toBe('E-commerce API is running');
    });
  });

  describe('validation', () => {
    it('coerces query parameters through the DTO', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/probe?page=2&limit=5&order=asc')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.query).toMatchObject({
        page: 2,
        limit: 5,
        order: 'asc',
      });
      expect(typeof response.body.data.query.limit).toBe('number');
    });

    it('rejects out-of-range values with a details array', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/probe?limit=1000')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        path: '/api/probe?limit=1000',
        method: 'GET',
      });
      expect(response.body.details).toEqual(
        expect.arrayContaining([expect.stringContaining('limit')]),
      );
      expect(response.body.timestamp).toEqual(expect.any(String));
    });

    it('rejects unknown query parameters instead of ignoring them', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/probe?pageSize=10')
        .expect(400);

      expect(response.body.details).toEqual(
        expect.arrayContaining([expect.stringContaining('pageSize')]),
      );
    });
  });

  describe('error shape', () => {
    it('returns a consistent body for unknown routes', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/nope')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 404,
        error: 'Not Found',
        path: '/api/nope',
        method: 'GET',
      });
      expect(response.body).not.toHaveProperty('stack');
    });
  });
});
