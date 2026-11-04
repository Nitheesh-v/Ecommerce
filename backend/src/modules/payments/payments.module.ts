import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { ValidatedEnv } from '../../config/env.validation.js';
import { ActiveAccountGuard } from '../auth/guards/active-account.guard.js';
import { OrdersModule } from '../orders/orders.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminPaymentsController } from './admin-payments.controller.js';
import { DisabledPaymentGateway } from './disabled.gateway.js';
import { PAYMENT_GATEWAY } from './payment-gateway.js';
import type { PaymentGateway } from './payment-gateway.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { RazorpayGateway } from './razorpay.gateway.js';
import { MongoPaymentEventsRepository } from './repositories/mongo-payment-events.repository.js';
import { MongoPaymentsRepository } from './repositories/mongo-payments.repository.js';
import { PaymentEventsRepository } from './repositories/payment-events.repository.js';
import { PaymentsRepository } from './repositories/payments.repository.js';
import { Payment, PaymentSchema } from './schemas/payment.schema.js';
import {
  PaymentEvent,
  PaymentEventSchema,
} from './schemas/payment-event.schema.js';

/**
 * Payment management.
 *
 * Dependency direction is one-way: payments → orders. The order module knows
 * nothing about Razorpay; it accepts a *verified* capture through
 * `confirmGatewayPayment()` and publishes refund changes through `OrderEvents`,
 * which this module subscribes to on boot.
 *
 * The gateway provider is chosen from configuration: complete Razorpay
 * credentials ⇒ real adapter, none ⇒ a disabled adapter that answers 503 while
 * every admin view keeps working. Tests override the token with a fake.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: PaymentEvent.name, schema: PaymentEventSchema },
    ]),
    OrdersModule,
    // `ActiveAccountGuard` re-reads the account, so suspended customers cannot pay.
    UsersModule,
  ],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [
    PaymentsService,
    ActiveAccountGuard,
    { provide: PaymentsRepository, useClass: MongoPaymentsRepository },
    { provide: PaymentEventsRepository, useClass: MongoPaymentEventsRepository },
    {
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<ValidatedEnv, true>,
      ): PaymentGateway => {
        const keyId = configService.get('RAZORPAY_KEY_ID', { infer: true });
        const keySecret = configService.get('RAZORPAY_KEY_SECRET', { infer: true });
        const webhookSecret = configService.get('RAZORPAY_WEBHOOK_SECRET', {
          infer: true,
        });

        // Env validation guarantees all three are set together (or none are).
        if (!keyId || !keySecret || !webhookSecret) {
          return new DisabledPaymentGateway();
        }

        return new RazorpayGateway({ keyId, keySecret, webhookSecret });
      },
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
