// src/modules/notifications/mail/mail-sender.ts
import { Injectable, Logger } from '@nestjs/common';

/** One outgoing email. Plain text is required; HTML is the same message, styled. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * The email seam.
 *
 * An abstract class, so it is both the DI token and the contract: the module
 * provides `SmtpMailSender` when credentials exist and `NoopMailSender` when they
 * do not, and the e2e suite overrides it with a recorder.
 *
 * `configured` is deliberately part of the contract rather than an error path:
 * a store with no SMTP is a supported configuration, and the notification must
 * still be recorded in-app with its email half marked `skipped`.
 */
export abstract class MailSender {
  /** `true` when messages would actually leave the process. */
  abstract readonly configured: boolean;

  /** Short, human-readable description for the admin console. */
  abstract readonly transport: string;

  abstract send(message: MailMessage): Promise<void>;
}

/**
 * The no-credentials sender.
 *
 * It never pretends to deliver. `NotificationsService` checks `configured` before
 * calling `send`, so this exists mostly to keep the log honest when something
 * bypasses that check.
 */
@Injectable()
export class NoopMailSender extends MailSender {
  private readonly logger = new Logger('NotificationsEmail');
  readonly configured = false;
  readonly transport = 'logger (SMTP not configured)';

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`Email not sent — SMTP is not configured (to ${message.to}: ${message.subject})`);
  }
}

/** Thrown by senders when the provider refuses a message; carries the reason. */
export class MailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailDeliveryError';
  }
}
