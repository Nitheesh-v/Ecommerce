import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { TestingModuleBuilder } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { configureApp } from '../../src/app.setup.js';
import type { ValidatedEnv } from '../../src/config/env.validation.js';
import { DashboardRepository } from '../../src/modules/admin/repositories/dashboard.repository.js';
import { SessionsRepository } from '../../src/modules/auth/repositories/sessions.repository.js';
import { Session } from '../../src/modules/auth/schemas/session.schema.js';
import { CategoriesRepository } from '../../src/modules/categories/repositories/categories.repository.js';
import { CustomersRepository } from '../../src/modules/customers/repositories/customers.repository.js';
import { Category } from '../../src/modules/categories/schemas/category.schema.js';
import { InventoryRepository } from '../../src/modules/inventory/repositories/inventory.repository.js';
import { InventoryAlert } from '../../src/modules/inventory/schemas/inventory-alert.schema.js';
import { InventoryMovement } from '../../src/modules/inventory/schemas/inventory-movement.schema.js';
import { OrdersRepository } from '../../src/modules/orders/repositories/orders.repository.js';
import { Order } from '../../src/modules/orders/schemas/order.schema.js';
import { PaymentEventsRepository } from '../../src/modules/payments/repositories/payment-events.repository.js';
import { PaymentsRepository } from '../../src/modules/payments/repositories/payments.repository.js';
import { PAYMENT_GATEWAY } from '../../src/modules/payments/payment-gateway.js';
import type { PaymentGateway } from '../../src/modules/payments/payment-gateway.js';
import { PaymentEvent } from '../../src/modules/payments/schemas/payment-event.schema.js';
import { Payment } from '../../src/modules/payments/schemas/payment.schema.js';
import { ProductsRepository } from '../../src/modules/products/repositories/products.repository.js';
import { Product } from '../../src/modules/products/schemas/product.schema.js';
import { ImageStorage } from '../../src/modules/uploads/image-storage.js';
import { UsersRepository } from '../../src/modules/users/repositories/users.repository.js';
import { User } from '../../src/modules/users/schemas/user.schema.js';

export interface CreateTestAppOptions {
  imports: Type<unknown>[];
  /** Substitute the persistence layer (required for auth flows). */
  users?: UsersRepository;
  sessions?: SessionsRepository;
  /** Substitute dashboard analytics (admin module). */
  dashboard?: DashboardRepository;
  /** Substitute the product catalogue. */
  products?: ProductsRepository;
  /** Substitute categories (products reference them). */
  categories?: CategoriesRepository;
  /** Substitute image storage (no disk, no CDN). */
  imageStorage?: ImageStorage;
  /** Substitute inventory persistence (movements + alerts). */
  inventory?: InventoryRepository;
  /** Substitute order persistence. */
  orders?: OrdersRepository;
  /** Substitute the customer read model (users joined with orders). */
  customers?: CustomersRepository;
  /** Substitute gateway transactions. */
  payments?: PaymentsRepository;
  /** Substitute the payment event log (webhook idempotency). */
  paymentEvents?: PaymentEventsRepository;
  /** Substitute the payment gateway (no network, deterministic ids). */
  paymentGateway?: PaymentGateway;
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
    .useValue({})
    .overrideProvider(getModelToken(Product.name))
    .useValue({})
    .overrideProvider(getModelToken(Category.name))
    .useValue({})
    .overrideProvider(getModelToken(InventoryMovement.name))
    .useValue({})
    .overrideProvider(getModelToken(InventoryAlert.name))
    .useValue({})
    .overrideProvider(getModelToken(Order.name))
    .useValue({})
    .overrideProvider(getModelToken(Payment.name))
    .useValue({})
    .overrideProvider(getModelToken(PaymentEvent.name))
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

  if (options.dashboard) {
    builder = builder
      .overrideProvider(DashboardRepository)
      .useValue(options.dashboard);
  }

  if (options.products) {
    builder = builder
      .overrideProvider(ProductsRepository)
      .useValue(options.products);
  }

  if (options.categories) {
    builder = builder
      .overrideProvider(CategoriesRepository)
      .useValue(options.categories);
  }

  if (options.imageStorage) {
    builder = builder.overrideProvider(ImageStorage).useValue(options.imageStorage);
  }

  if (options.inventory) {
    builder = builder
      .overrideProvider(InventoryRepository)
      .useValue(options.inventory);
  }

  if (options.orders) {
    builder = builder.overrideProvider(OrdersRepository).useValue(options.orders);
  }

  if (options.customers) {
    builder = builder
      .overrideProvider(CustomersRepository)
      .useValue(options.customers);
  }

  if (options.payments) {
    builder = builder.overrideProvider(PaymentsRepository).useValue(options.payments);
  }

  if (options.paymentEvents) {
    builder = builder
      .overrideProvider(PaymentEventsRepository)
      .useValue(options.paymentEvents);
  }

  if (options.paymentGateway) {
    builder = builder.overrideProvider(PAYMENT_GATEWAY).useValue(options.paymentGateway);
  }

  const moduleFixture = await builder.compile();
  // Mirrors `main.ts`, so webhook signature tests exercise the production stack.
  const app = moduleFixture.createNestApplication<INestApplication<App>>({
    rawBody: true,
  });

  configureApp(app, app.get<ConfigService<ValidatedEnv, true>>(ConfigService), {
    swagger: false,
    cors: false,
  });
  await app.init();

  return app;
}
