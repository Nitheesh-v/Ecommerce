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

// A deliberately tiny window/limit keeps the test fast and deterministic.
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
  process.env.THROTTLE_LIMIT = '2';
  process.env.THROTTLE_TTL = '60';
});

describe('Rate limiting (e2e)', () => {
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
