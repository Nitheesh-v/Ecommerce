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
import { AddressesRepository } from '../../src/modules/addresses/repositories/addresses.repository.js';
import { Address } from '../../src/modules/addresses/schemas/address.schema.js';
import { SessionsRepository } from '../../src/modules/auth/repositories/sessions.repository.js';
import { CartsRepository } from '../../src/modules/cart/repositories/cart.repository.js';
import { Cart } from '../../src/modules/cart/schemas/cart.schema.js';
import { Session } from '../../src/modules/auth/schemas/session.schema.js';
import { CategoriesRepository } from '../../src/modules/categories/repositories/categories.repository.js';
import { CustomersRepository } from '../../src/modules/customers/repositories/customers.repository.js';
import { Category } from '../../src/modules/categories/schemas/category.schema.js';
import { InventoryRepository } from '../../src/modules/inventory/repositories/inventory.repository.js';
import { MailSender, NoopMailSender } from '../../src/modules/notifications/mail/mail-sender.js';
import { NotificationsRepository } from '../../src/modules/notifications/repositories/notifications.repository.js';
import { Notification } from '../../src/modules/notifications/schemas/notification.schema.js';
import { InMemoryNotificationsRepository } from './in-memory-notifications.repository.js';
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
import { OffersRepository, RedemptionsRepository } from '../../src/modules/coupons/repositories/offers.repository.js';
import {
  CouponCustomerUsage,
  CouponRedemption,
  Offer,
} from '../../src/modules/coupons/schemas/offer.schema.js';
import { ReviewsRepository } from '../../src/modules/reviews/repositories/reviews.repository.js';
import { Review } from '../../src/modules/reviews/schemas/review.schema.js';
import { ShipmentsRepository } from '../../src/modules/shipments/repositories/shipments.repository.js';
import { CustomerInsightsRepository } from '../../src/modules/admin/repositories/customer-insights.repository.js';
import { InMemoryCustomerInsightsRepository } from './in-memory-customer-insights.repository.js';
import { SettingsRepository } from '../../src/modules/settings/repositories/settings.repository.js';
import { StoreSetting } from '../../src/modules/settings/schemas/setting.schema.js';
import { InMemorySettingsRepository } from './in-memory-settings.repository.js';
import { Shipment } from '../../src/modules/shipments/schemas/shipment.schema.js';
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
  /** Substitute shipment persistence. */
  shipments?: ShipmentsRepository;
  /** Substitute offer persistence (admin offers + coupon validation). */
  offers?: OffersRepository;
  /** Substitute the redemption ledger. */
  redemptions?: RedemptionsRepository;
  /** Substitute review persistence. */
  reviews?: ReviewsRepository;
  /** Substitute the customer address book. */
  addresses?: AddressesRepository;
  /** Substitute the server-side cart. */
  carts?: CartsRepository;
  /** Substitute notification persistence (defaults to an empty in-memory store). */
  notifications?: NotificationsRepository;
  /** Substitute the email transport (defaults to the no-op sender — no SMTP in CI). */
  mailSender?: MailSender;
  /** Substitute store settings (defaults to an in-memory store seeded from env). */
  settings?: SettingsRepository;
  /** Substitute customer analytics (defaults to an empty store). */
  customerInsights?: CustomerInsightsRepository;
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
    .useValue({})
    .overrideProvider(getModelToken(Shipment.name))
    .useValue({})
    .overrideProvider(getModelToken(Offer.name))
    .useValue({})
    .overrideProvider(getModelToken(CouponRedemption.name))
    .useValue({})
    .overrideProvider(getModelToken(CouponCustomerUsage.name))
    .useValue({})
    .overrideProvider(getModelToken(Review.name))
    .useValue({})
    .overrideProvider(getModelToken(StoreSetting.name))
    .useValue({})
    .overrideProvider(getModelToken(Address.name))
    .useValue({})
    .overrideProvider(getModelToken(Cart.name))
    .useValue({})
    .overrideProvider(getModelToken(Notification.name))
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

  if (options.shipments) {
    builder = builder
      .overrideProvider(ShipmentsRepository)
      .useValue(options.shipments);
  }

  if (options.offers) {
    builder = builder.overrideProvider(OffersRepository).useValue(options.offers);
  }

  if (options.redemptions) {
    builder = builder
      .overrideProvider(RedemptionsRepository)
      .useValue(options.redemptions);
  }

  if (options.reviews) {
    builder = builder.overrideProvider(ReviewsRepository).useValue(options.reviews);
  }

  if (options.addresses) {
    builder = builder.overrideProvider(AddressesRepository).useValue(options.addresses);
  }

  if (options.carts) {
    builder = builder.overrideProvider(CartsRepository).useValue(options.carts);
  }

  // Notifications are always substituted: every flow records them (orders, payments,
  // shipments, reviews, inventory alerts), so an empty in-memory store keeps the
  // suite deterministic without a database.
  builder = builder
    .overrideProvider(NotificationsRepository)
    .useValue(options.notifications ?? new InMemoryNotificationsRepository());

  // Email is always stubbed. `NoopMailSender` reports `configured: false`, so rows
  // land as `skipped` — the honest state of a store with no SMTP.
  builder = builder
    .overrideProvider(MailSender)
    .useValue(options.mailSender ?? new NoopMailSender());

  // Settings are always substituted: orders and coupons price through them, and a
  // real one would need the database.
  builder = builder
    .overrideProvider(SettingsRepository)
    .useValue(options.settings ?? new InMemorySettingsRepository());

  // Customer analytics normally aggregates the orders collection in Mongo; the e2e
  // suite substitutes deterministic fixtures so report shapes can be asserted.
  builder = builder
    .overrideProvider(CustomerInsightsRepository)
    .useValue(options.customerInsights ?? new InMemoryCustomerInsightsRepository());

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
