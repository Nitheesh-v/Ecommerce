import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryController } from './inventory.controller.js';
import { InventoryNotifier } from './inventory.notifier.js';
import { InventoryService } from './inventory.service.js';
import { InventoryRepository } from './repositories/inventory.repository.js';
import { MongoInventoryRepository } from './repositories/mongo-inventory.repository.js';
import { InventoryAlert, InventoryAlertSchema } from './schemas/inventory-alert.schema.js';
import {
  InventoryMovement,
  InventoryMovementSchema,
} from './schemas/inventory-movement.schema.js';

/**
 * Inventory module.
 *
 * Note what is **not** here: an `Inventory` collection holding a second copy of
 * the quantity. `products.stock` (owned by `ProductsModule`) remains the single
 * source of truth; this module adds the rules around changing it (`InventoryService`)
 * and the audit/alert collections.
 *
 * `InventoryRepository` is an abstract class used as the DI token, so the e2e
 * suite can swap in an in-memory implementation (no `mongod` in CI).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InventoryMovement.name, schema: InventoryMovementSchema },
      { name: InventoryAlert.name, schema: InventoryAlertSchema },
    ]),
  ],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryNotifier,
    { provide: InventoryRepository, useClass: MongoInventoryRepository },
  ],
  // Exported so `ProductsService` can log initial stock and future order
  // services can reserve/restore stock through the same invariants.
  exports: [InventoryService, InventoryRepository],
})
export class InventoryModule {}
