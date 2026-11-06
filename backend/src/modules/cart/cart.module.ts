// src/modules/cart/cart.module.ts

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActiveAccountGuard } from '../auth/guards/active-account.guard.js';
import { CouponsModule } from '../coupons/coupons.module.js';
import { UsersModule } from '../users/users.module.js';
import { ProductsModule } from '../products/products.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import { CartsRepository } from './repositories/cart.repository.js';
import { MongooseCartsRepository } from './repositories/mongoose-cart.repository.js';
import { Cart, CartSchema } from './schemas/cart.schema.js';

/**
 * The server-side cart.
 *
 * It depends on products (live prices and stock), coupons (validating the applied
 * code) and settings (tax/shipping). Nothing depends on *it* except checkout, which
 * goes through `CartService.snapshot()`/`clearAfterOrder()` rather than reading the
 * `carts` collection itself.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cart.name, schema: CartSchema }]),
    ProductsModule,
    CouponsModule,
    SettingsModule,
    // `ActiveAccountGuard` needs the user lookup it guards with.
    UsersModule,
  ],
  controllers: [CartController],
  providers: [
    CartService,
    ActiveAccountGuard,
    { provide: CartsRepository, useClass: MongooseCartsRepository },
  ],
  exports: [CartService],
})
export class CartsModule {}
