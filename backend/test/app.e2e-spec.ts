import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { HealthModule } from './../src/health/health.module.js';

/**
 * Stand-in for `MongooseModule.forRoot()`. In the real application the Mongoose
 * core module is `@Global()`, which is what makes `@InjectConnection()` work
 * inside `HealthModule`; this fake reproduces exactly that contract so the
 * health routes can be tested without a live database.
 */
function createFakeMongooseModule(readyState: number) {
  const connectionToken = getConnectionToken();

  @Global()
  @Module({
    providers: [
      {
        provide: connectionToken,
        useValue: {
          readyState,
          name: 'ecommerce-test',
          host: '127.0.0.1',
        },
      },
    ],
    exports: [connectionToken],
  })
  class FakeMongooseModule {}

  return FakeMongooseModule;
}

async function createHealthApp(readyState: number): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [createFakeMongooseModule(readyState), HealthModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();

  return app;
}

describe('Health (e2e)', () => {
  describe('with a connected database', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await createHealthApp(1);
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/health returns 200', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'E-commerce API is running',
      });
      expect(typeof response.body.timestamp).toBe('string');
    });

    it('GET /api/health/ready returns 200 and reports the database as up', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health/ready')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        status: 'ok',
        checks: {
          database: { status: 'up', state: 'connected' },
        },
      });
    });
  });

  describe('with a disconnected database', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await createHealthApp(0);
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/health still returns 200 (liveness ignores dependencies)', async () => {
      await request(app.getHttpServer()).get('/api/health').expect(200);
    });

    it('GET /api/health/ready returns 503 and reports the database as down', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health/ready')
        .expect(503);

      expect(response.body).toMatchObject({
        success: false,
        status: 'degraded',
        checks: {
          database: { status: 'down', state: 'disconnected' },
        },
      });
    });
  });
});
