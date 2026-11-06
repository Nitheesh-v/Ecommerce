// src/modules/checkout/checkout.module.ts

import { Module } from '@nestjs/common';
import { AddressesModule } from '../addresses/addresses.module.js';
import { CartsModule } from '../cart/cart.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { ActiveAccountGuard } from '../auth/guards/active-account.guard.js';
import { SettingsModule } from '../settings/settings.module.js';
import { UsersModule } from '../users/users.module.js';
import { CheckoutController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';

/**
 * Checkout.
 *
 * Deliberately thin on imports: it reads the cart, addresses, order creation,
 * payments and settings — every one of which already exists and is exported. There
 * is no checkout repository, because checkout owns no data: the order *is* the
 * record of a completed checkout.
 */
@Module({
  imports: [
    CartsModule,
    AddressesModule,
    OrdersModule,
    PaymentsModule,
    SettingsModule,
    UsersModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService, ActiveAccountGuard],
  exports: [CheckoutService],
})
export class CheckoutModule {}
