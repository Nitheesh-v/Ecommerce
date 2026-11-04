import { Module } from '@nestjs/common';
import { OrderEvents } from './order-events.js';

/**
 * The order event bus on its own.
 *
 * It is split out so a module can *listen* to order events without importing
 * `OrdersModule` — which would otherwise be a cycle the moment orders needs that
 * module's service (as coupons do, to price a cart). Subscribers import this
 * module; the orders module imports it too and publishes from its write path.
 */
@Module({
  providers: [OrderEvents],
  exports: [OrderEvents],
})
export class OrderEventsModule {}
