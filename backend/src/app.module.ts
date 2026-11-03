import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
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
      useFactory: (configService: ConfigService<ValidatedEnv, true>) => {
        const nodeEnv = configService.get('NODE_ENV', { infer: true });

        return {
          uri: configService.get('MONGODB_URI', { infer: true }),
          // Fail within 10s instead of hanging when the cluster is unreachable.
          serverSelectionTimeoutMS: 10_000,
          // Bounded retries keep boot failures observable and fast.
          retryAttempts: 3,
          retryDelay: 3_000,
          // Building indexes on every boot is a production hazard; use migrations.
          autoIndex: nodeEnv !== 'production',
        };
      },
    }),

    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
