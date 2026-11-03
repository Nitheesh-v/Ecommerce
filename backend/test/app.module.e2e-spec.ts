import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import type { ValidatedEnv } from './../src/config/env.validation.js';

// ConfigModule.forRoot() validates the environment while the module decorator
// is evaluated, i.e. during the import of AppModule. vi.hoisted() runs before
// the imports are resolved, so the test environment is in place in time.
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
});

/**
 * Boots the real AppModule — config validation, Mongoose wiring, controllers,
 * global pipe/filter/interceptors — with the database connection substituted, so
 * the module graph and the `/api` prefix are verified without a live MongoDB.
 */
describe('AppModule (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getConnectionToken())
      .useValue({
        readyState: 1,
        name: 'ecommerce-test',
        host: '127.0.0.1',
        // MongooseCoreModule calls close() during app shutdown.
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

  it('GET /api responds from the root controller inside the envelope', async () => {
    const response = await request(app.getHttpServer()).get('/api').expect(200);

    expect(response.body).toEqual({ success: true, data: 'Hello World!' });
  });

  it('GET /api/health returns a flat liveness payload', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      message: 'E-commerce API is running',
    });
    expect(response.body).not.toHaveProperty('data');
  });

  it('GET /api/health/ready returns 200 when the database is connected', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.checks.database.status).toBe('up');
  });

  it('returns the error envelope for an unknown route', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/does-not-exist')
      .expect(404);

    expect(response.body).toMatchObject({
      success: false,
      statusCode: 404,
      path: '/api/does-not-exist',
    });
  });
});
