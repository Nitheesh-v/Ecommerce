import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schema.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { AdminSettingsController } from './admin-settings.controller.js';
import { PublicStoreController } from './public-store.controller.js';
import { MongoSettingsRepository } from './repositories/mongo-settings.repository.js';
import { SettingsRepository } from './repositories/settings.repository.js';
import { StoreSetting, StoreSettingSchema } from './schemas/setting.schema.js';
import { SettingsService } from './settings.service.js';

/**
 * Store settings.
 *
 * Exports `SettingsService`, which is the pricing authority for orders and coupons.
 * Orders does **not** import this module's neighbours and this module imports no
 * feature module: the order and product models are registered here purely for a
 * read-only footprint count (see `SettingsRepository.dataFootprint`), which keeps
 * the dependency graph acyclic.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StoreSetting.name, schema: StoreSettingSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [AdminSettingsController, PublicStoreController],
  providers: [
    SettingsService,
    { provide: SettingsRepository, useClass: MongoSettingsRepository },
  ],
  exports: [SettingsService],
})
export class SettingsModule {}
