import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ProductsModule } from '../products/products.module.js';
import { UsersModule } from '../users/users.module.js';
import { ActiveAccountGuard } from '../auth/guards/active-account.guard.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { OrderEvents } from './order-events.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { MongooseOrdersRepository } from './repositories/mongoose-orders.repository.js';
import { OrdersRepository } from './repositories/orders.repository.js';
import { Order, OrderSchema } from './schemas/order.schema.js';

/**
 * Orders module.
 *
 * Depends on products (prices, stock, snapshots) and inventory (reserve/restock).
 * Neither depends on orders, so the graph stays acyclic: products → inventory,
 * orders → products + inventory.
 *
 * The repository is an abstract class used as the DI token so e2e tests can swap
 * in an in-memory implementation (no database in CI).
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    ProductsModule,
    InventoryModule,
    // Needed to block suspended accounts and to learn the checkout phone number.
    UsersModule,
  ],
  controllers: [OrdersController, AdminOrdersController],
  providers: [
    OrdersService,
    OrderEvents,
    ActiveAccountGuard,
    { provide: OrdersRepository, useClass: MongooseOrdersRepository },
  ],
  exports: [OrdersService, OrdersRepository, OrderEvents],
})
export class OrdersModule {}
