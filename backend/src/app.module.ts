import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { validateEnv } from './config/env.validation.js';
import type { ValidatedEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { AddressesModule } from './modules/addresses/addresses.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CartsModule } from './modules/cart/cart.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { CheckoutModule } from './modules/checkout/checkout.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { CouponsModule } from './modules/coupons/coupons.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { ReviewsModule } from './modules/reviews/reviews.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { ShipmentsModule } from './modules/shipments/shipments.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { UploadsModule } from './modules/uploads/uploads.module.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';
import { diagnoseConnectionFailure } from './database/database-diagnostics.js';
import { RolesGuard } from './modules/auth/guards/roles.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<ValidatedEnv, true>) => ({
        uri: configService.get('MONGODB_URI', { infer: true }),
        // Fail within 10s instead of hanging when the cluster is unreachable.
        serverSelectionTimeoutMS: 10_000,
        // Bounded retries keep boot failures observable and fast.
        retryAttempts: 3,
        retryDelay: 3_000,
        // Building indexes on every boot is a production hazard; use migrations.
        autoIndex: configService.get('NODE_ENV', { infer: true }) !== 'production',
        /**
         * Turns the driver's one-liner ("Could not connect to any servers…") into
         * something an operator can act on, without repeating the full checklist on
         * every retry — `main.ts` prints that once when the retries run out.
         */
        connectionErrorFactory: (error: Error): Error => {
          const uri = configService.get('MONGODB_URI', { infer: true });
          const { summary } = diagnoseConnectionFailure(error, uri);
          const annotated = new Error(`${error.message}\n  ↳ ${summary}`);

          annotated.name = error.name;
          annotated.stack = error.stack;

          return annotated;
        },
      }),
    }),

    // Global rate limiting. Per-route overrides arrive with auth in Phase 4
    // (stricter limits on login/register/password reset).
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<ValidatedEnv, true>) => [
        {
          // The throttler expects milliseconds; the env var is in seconds.
          ttl: configService.get('THROTTLE_TTL', { infer: true }) * 1_000,
          limit: configService.get('THROTTLE_LIMIT', { infer: true }),
        },
      ],
    }),

    AuthModule,
    AdminModule,
    CategoriesModule,
    ProductsModule,
    InventoryModule,
    OrdersModule,
    CustomersModule,
    CouponsModule,
    PaymentsModule,
    AddressesModule,
    CartsModule,
    CheckoutModule,
    NotificationsModule,
    ReviewsModule,
    SettingsModule,
    ShipmentsModule,
    UploadsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,

    // Global validation. `whitelist` strips unknown properties, `forbidNonWhitelisted`
    // rejects them (so typos in payloads fail loudly instead of silently),
    // `transform` produces DTO instances and applies @Type() conversions.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        // Explicit @Type() conversions only — implicit conversion would coerce
        // "abc" into numbers in surprising places.
        transformOptions: { enableImplicitConversion: false },
      }),
    },

    // Guard order matters: throttle first (cheap), then authenticate, then
    // authorise. Every route is authenticated unless marked @Public().
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },

    // Order matters: logging is outermost so it measures the full request.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },

    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
