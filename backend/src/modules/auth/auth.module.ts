import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import type { ValidatedEnv } from '../../config/env.validation.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { MongooseSessionsRepository } from './repositories/mongoose-sessions.repository.js';
import { SessionsRepository } from './repositories/sessions.repository.js';
import { Session, SessionSchema } from './schemas/session.schema.js';
import { AuthService } from './services/auth.service.js';
import { TokenService } from './services/token.service.js';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([{ name: Session.name, schema: SessionSchema }]),

    // `global: true` so the global JwtAuthGuard (registered in AppModule) and
    // future modules can inject JwtService without importing AuthModule.
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<ValidatedEnv, true>) => ({
        secret: configService.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: configService.get('JWT_ACCESS_EXPIRES_IN', { infer: true }),
          issuer: 'ecommerce-api',
          audience: 'ecommerce-web',
        },
        verifyOptions: {
          issuer: 'ecommerce-api',
          audience: 'ecommerce-web',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    { provide: SessionsRepository, useClass: MongooseSessionsRepository },
  ],
  exports: [AuthService, TokenService, SessionsRepository],
})
export class AuthModule {}
