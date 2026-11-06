// src/modules/notifications/mail/smtp-mail-sender.ts
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { Logger } from '@nestjs/common';
import { MailDeliveryError, MailSender } from './mail-sender.js';
import type { MailMessage } from './mail-sender.js';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
  replyTo?: string;
}

/**
 * Real SMTP delivery through nodemailer.
 *
 * The transport is created once and reused (connections are pooled by nodemailer);
 * `send` rejects with a `MailDeliveryError` carrying the provider's own message,
 * which the service stores on the row so an operator can see *why* an email failed
 * rather than a generic "sending failed".
 *
 * Nothing here is provider-specific: any SMTP server works, and the store keeps
 * running when it is down — a failed send is recorded, never thrown into the
 * checkout path.
 */
export class SmtpMailSender extends MailSender {
  private readonly logger = new Logger('NotificationsEmail');
  private readonly transporter: Transporter;
  readonly configured = true;

  constructor(private readonly config: SmtpConfig) {
    super();

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.user && config.password
        ? { auth: { user: config.user, pass: config.password } }
        : {}),
    });
  }

  get transport(): string {
    return `smtp ${this.config.host}:${this.config.port}`;
  }

  async send(message: MailMessage): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(this.config.replyTo ? { replyTo: this.config.replyTo } : {}),
      });

      this.logger.log(`Sent "${message.subject}" to ${message.to} (${info.messageId})`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      throw new MailDeliveryError(reason.slice(0, 300));
    }
  }
}
