import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { validateEnv } from './config/env.validation.js';
import type { ValidatedEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';

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

    { provide: APP_GUARD, useClass: ThrottlerGuard },

    // Order matters: logging is outermost so it measures the full request.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },

    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
