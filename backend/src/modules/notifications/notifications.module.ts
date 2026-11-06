// src/modules/notifications/notifications.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { ValidatedEnv } from '../../config/env.validation.js';
import { ActiveAccountGuard } from '../auth/guards/active-account.guard.js';
import { OrderEventsModule } from '../orders/order-events.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminNotificationsController } from './admin-notifications.controller.js';
import { MailSender, NoopMailSender } from './mail/mail-sender.js';
import { SmtpMailSender } from './mail/smtp-mail-sender.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { OrderNotificationsListener } from './order-notifications.listener.js';
import { MongoNotificationsRepository } from './repositories/mongoose-notifications.repository.js';
import { NotificationsRepository } from './repositories/notifications.repository.js';
import { Notification, NotificationSchema } from './schemas/notification.schema.js';

/**
 * Notifications.
 *
 * The graph stays acyclic by design: this module **listens** to `OrderEvents`
 * (which orders already publishes into) rather than being imported by orders. The
 * bus is best-effort, so an unreachable mail server can never fail a checkout.
 *
 * Modules that emit directly — payments, shipments, reviews, auth, inventory —
 * import this module and call `NotificationsService`, whose `notify()` never
 * throws. Nothing imports *those* modules back.
 *
 * `MailSender` is chosen from configuration at boot: with `SMTP_HOST` and
 * `MAIL_FROM` present it is a real SMTP transport; without them it is a no-op, and
 * every notification is still recorded in-app with its email marked `skipped`.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }]),
    SettingsModule,
    OrderEventsModule,
    // `ActiveAccountGuard` re-reads the account (suspended customers see nothing).
    UsersModule,
  ],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [
    NotificationsService,
    OrderNotificationsListener,
    ActiveAccountGuard,
    { provide: NotificationsRepository, useClass: MongoNotificationsRepository },
    {
      provide: MailSender,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<ValidatedEnv, true>): MailSender => {
        const host = configService.get('SMTP_HOST', { infer: true });
        const from = configService.get('MAIL_FROM', { infer: true });

        // Env validation guarantees the pair is set together (or neither is).
        if (!host || !from) {
          return new NoopMailSender();
        }

        const port = configService.get('SMTP_PORT', { infer: true }) ?? 587;
        const user = configService.get('SMTP_USER', { infer: true });
        const password = configService.get('SMTP_PASSWORD', { infer: true });
        const secure = configService.get('SMTP_SECURE', { infer: true }) ?? port === 465;

        return new SmtpMailSender({
          host,
          port,
          secure,
          from,
          ...(user && password ? { user, password } : {}),
          replyTo: from,
        });
      },
    },
  ],
  exports: [NotificationsService, NotificationsRepository],
})
export class NotificationsModule {}
