import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';

// ConfigModule.forRoot() validates the environment while the module decorator
// is evaluated, i.e. during the import of AppModule. vi.hoisted() runs before
// the imports are resolved, so the test environment is in place in time.
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/ecommerce-test';
});

const { AppModule } = await import('./../src/app.module.js');

/**
 * Boots the real AppModule — config validation, Mongoose wiring, controllers —
 * with the database connection substituted, so the module graph and the global
 * `/api` prefix are verified without a live MongoDB instance.
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
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api responds from the root controller', async () => {
    const response = await request(app.getHttpServer()).get('/api').expect(200);

    expect(response.text).toBe('Hello World!');
  });

  it('GET /api/health returns 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(response.body.success).toBe(true);
  });

  it('GET /api/health/ready returns 200 when the database is connected', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.checks.database.status).toBe('up');
  });

  it('returns 404 for an unknown route', async () => {
    await request(app.getHttpServer()).get('/api/does-not-exist').expect(404);
  });
});
