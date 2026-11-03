import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { createTestApp } from './support/create-test-app.js';
import { HardeningTestModule } from './support/hardening-test.module.js';

// A deliberately tiny window/limit keeps the test fast and deterministic.
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
  process.env.JWT_ACCESS_SECRET = 'integration-test-secret-value-32-chars-min';
  process.env.THROTTLE_LIMIT = '2';
  process.env.THROTTLE_TTL = '60';
});

describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({ imports: [HardeningTestModule] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows THROTTLE_LIMIT requests, then responds 429 in the standard error shape', async () => {
    await request(app.getHttpServer()).get('/api/probe?page=1').expect(200);
    await request(app.getHttpServer()).get('/api/probe?page=1').expect(200);

    const blocked = await request(app.getHttpServer())
      .get('/api/probe?page=1')
      .expect(429);

    expect(blocked.body).toMatchObject({
      success: false,
      statusCode: 429,
      error: 'Too Many Requests',
    });
    expect(blocked.body.requestId).toEqual(expect.any(String));
  });

  it('never rate-limits health probes', async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await request(app.getHttpServer()).get('/api/health').expect(200);
    }
  });
});
