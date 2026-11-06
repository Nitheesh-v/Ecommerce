import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActiveAccountGuard } from '../auth/guards/active-account.guard.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminShipmentsController } from './admin-shipments.controller.js';
import { CourierRegistry } from './courier/courier-provider.js';
import { MongoShipmentsRepository } from './repositories/mongo-shipments.repository.js';
import { ShipmentsRepository } from './repositories/shipments.repository.js';
import { OrderTrackingController } from './order-tracking.controller.js';
import { Shipment, ShipmentSchema } from './schemas/shipment.schema.js';
import { ShipmentsService } from './shipments.service.js';

/**
 * Shipping & delivery.
 *
 * Depends on orders (eligibility, address snapshots, fulfilment promotion) and
 * users (the active-account guard on customer tracking). Nothing imports shipments,
 * so the graph stays acyclic and checkout/order/payment paths never depend on it.
 *
 * Courier credentials are optional: with none configured the module runs the manual
 * workflow and every admin view works.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Shipment.name, schema: ShipmentSchema }]),
    OrdersModule,
    UsersModule,
    // Failed-delivery notices (the only shipment state that leaves the order alone).
    NotificationsModule,
  ],
  controllers: [AdminShipmentsController, OrderTrackingController],
  providers: [
    ShipmentsService,
    CourierRegistry,
    ActiveAccountGuard,
    { provide: ShipmentsRepository, useClass: MongoShipmentsRepository },
  ],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
