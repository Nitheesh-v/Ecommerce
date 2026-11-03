import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModuleBuilder } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { configureApp } from '../../src/app.setup.js';
import type { ValidatedEnv } from '../../src/config/env.validation.js';
import { SessionsRepository } from '../../src/modules/auth/repositories/sessions.repository.js';
import { Session } from '../../src/modules/auth/schemas/session.schema.js';
import { UsersRepository } from '../../src/modules/users/repositories/users.repository.js';
import { User } from '../../src/modules/users/schemas/user.schema.js';

export interface CreateTestAppOptions {
  imports: Type<unknown>[];
  /** Substitute the persistence layer (required for auth flows). */
  users?: UsersRepository;
  sessions?: SessionsRepository;
}

/**
 * Boots a Nest application for e2e tests with the database removed from the graph.
 *
 * Two things are stubbed:
 * - the Mongoose connection (so nothing tries to reach a cluster);
 * - the model providers, whose factory would otherwise ask that connection for a
 *   model. The repositories above them are replaced with in-memory versions.
 *
 * The global prefix, security headers and cookie parser are applied through the
 * same `configureApp()` the real server uses.
 */
export async function createTestApp(
  options: CreateTestAppOptions,
): Promise<INestApplication<App>> {
  let builder: TestingModuleBuilder = Test.createTestingModule({
    imports: options.imports,
  })
    .overrideProvider(getConnectionToken())
    .useValue({
      readyState: 1,
      name: 'ecommerce-test',
      host: '127.0.0.1',
      close: async () => undefined,
    })
    .overrideProvider(getModelToken(User.name))
    .useValue({})
    .overrideProvider(getModelToken(Session.name))
    .useValue({});

  if (options.users) {
    builder = builder
      .overrideProvider(UsersRepository)
      .useValue(options.users);
  }

  if (options.sessions) {
    builder = builder
      .overrideProvider(SessionsRepository)
      .useValue(options.sessions);
  }

  const moduleFixture = await builder.compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();

  configureApp(app, app.get<ConfigService<ValidatedEnv, true>>(ConfigService), {
    swagger: false,
    cors: false,
  });
  await app.init();

  return app;
}
