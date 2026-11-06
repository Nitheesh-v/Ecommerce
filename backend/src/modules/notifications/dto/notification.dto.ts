// src/modules/notifications/dto/notification.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_EMAIL_STATUSES,
  NOTIFICATION_TYPES,
} from '../schemas/notification.schema.js';
import type {
  NotificationCategory,
  NotificationEmailStatus,
  NotificationType,
} from '../schemas/notification.schema.js';

/**
 * `?unreadOnly=false` must mean `false`.
 *
 * `@Type(() => Boolean)` would turn every non-empty string into `true`, so the one
 * value a client is most likely to send explicitly would be silently inverted.
 */
function ToBoolean(): PropertyDecorator {
  return Transform(({ value }) => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value === 'true' || value === '1';
    }

    return undefined;
  });
}

/** Query for a customer's own feed. */
export class CustomerNotificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only unread notifications' })
  @ToBoolean()
  @IsOptional()
  unreadOnly?: boolean;

  @ApiPropertyOptional({ enum: NOTIFICATION_CATEGORIES })
  @IsIn(NOTIFICATION_CATEGORIES)
  @IsOptional()
  category?: NotificationCategory;

  @ApiPropertyOptional({ enum: NOTIFICATION_TYPES })
  @IsIn(NOTIFICATION_TYPES)
  @IsOptional()
  type?: NotificationType;
}

/**
 * Query for the admin feed.
 *
 * `audience` is a parameter, not a route prefix: operators review both the
 * shop alerts and (for support) the messages sent to a customer, and only the
 * console's role check decides who may ask.
 */
export class AdminNotificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['admin', 'customer'], default: 'admin' })
  @IsIn(['admin', 'customer'])
  @IsOptional()
  audience: 'admin' | 'customer' = 'admin';

  @ApiPropertyOptional({ enum: NOTIFICATION_TYPES })
  @IsIn(NOTIFICATION_TYPES)
  @IsOptional()
  type?: NotificationType;

  @ApiPropertyOptional({ enum: NOTIFICATION_CATEGORIES })
  @IsIn(NOTIFICATION_CATEGORIES)
  @IsOptional()
  category?: NotificationCategory;

  @ApiPropertyOptional({ enum: NOTIFICATION_EMAIL_STATUSES })
  @IsIn(NOTIFICATION_EMAIL_STATUSES)
  @IsOptional()
  emailStatus?: NotificationEmailStatus;

  @ApiPropertyOptional({ description: 'Only unread notifications' })
  @ToBoolean()
  @IsOptional()
  unreadOnly?: boolean;

  @ApiPropertyOptional({ description: 'Inclusive ISO date, e.g. 2026-01-01' })
  @IsISO8601()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive ISO date, e.g. 2026-01-31' })
  @IsISO8601()
  @IsOptional()
  to?: string;
}

/** Marks a single admin notification as read. */
export class ReadNotificationParamDto {
  @IsMongoId()
  id!: string;
}

/** Free-form ticket/reference an operator may attach when retrying an email. */
export class RetryNotificationDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  note?: string;
}
