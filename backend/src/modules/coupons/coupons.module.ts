import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoriesModule } from '../categories/categories.module.js';
import { OrderEventsModule } from '../orders/order-events.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { ProductsModule } from '../products/products.module.js';
import { AdminOffersController } from './admin-offers.controller.js';
import { AdminRedemptionsController } from './admin-redemptions.controller.js';
import { CouponPricingService } from './coupon-pricing.js';
import { CouponsController, PublicOffersController } from './coupons.controller.js';
import { CouponsService } from './coupons.service.js';
import {
  CouponCustomerUsage,
  CouponCustomerUsageSchema,
  CouponRedemption,
  CouponRedemptionSchema,
  Offer,
  OfferSchema,
} from './schemas/offer.schema.js';
import { MongoOffersRepository } from './repositories/mongo-offers.repository.js';
import { MongoRedemptionsRepository } from './repositories/mongo-redemptions.repository.js';
import { OffersRepository, RedemptionsRepository } from './repositories/offers.repository.js';

/**
 * Offers, coupons and redemptions.
 *
 * The dependency direction is deliberate:
 *
 * - it listens to `OrderEventsModule` (a tiny module of its own) instead of
 *   importing `OrdersModule`, because `OrdersModule` imports *this* module to price
 *   a coupon — importing orders back would be a cycle;
 * - products and categories are read-only lookups used to price a cart and to label
 *   the public offers page;
 * - `CouponPricingService` is the abstract token checkout depends on, so the orders
 *   module never sees an `Offer`.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Offer.name, schema: OfferSchema },
      { name: CouponRedemption.name, schema: CouponRedemptionSchema },
      { name: CouponCustomerUsage.name, schema: CouponCustomerUsageSchema },
    ]),
    OrderEventsModule,
    // Currency and tax inputs for every preview this module renders.
    SettingsModule,
    ProductsModule,
    CategoriesModule,
  ],
  controllers: [
    AdminOffersController,
    AdminRedemptionsController,
    CouponsController,
    PublicOffersController,
  ],
  providers: [
    CouponsService,
    { provide: OffersRepository, useClass: MongoOffersRepository },
    { provide: RedemptionsRepository, useClass: MongoRedemptionsRepository },
    { provide: CouponPricingService, useExisting: CouponsService },
  ],
  exports: [CouponsService, CouponPricingService, OffersRepository, RedemptionsRepository],
})
export class CouponsModule {}
