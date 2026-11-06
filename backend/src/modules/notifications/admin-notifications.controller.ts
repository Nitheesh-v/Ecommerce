// src/modules/notifications/admin-notifications.controller.ts

import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import { Role } from '../../common/enums/role.enum.js';
import { AdminNotificationQueryDto } from './dto/notification.dto.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Notification operations — `/api/admin/notifications`.
 *
 * Admin-only. Two jobs: show the shop's own alerts (low stock, new reviews, new
 * orders) and let an operator inspect what was emailed to a customer when support
 * asks "did they get the shipping mail?". Retrying a failed email is explicit — the
 * store never silently re-sends.
 */
@ApiTags('admin-notifications')
@ApiBearerAuth()
@Roles(Role.Admin)
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Admin role required' })
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications (audience, type, category, email state, dates)' })
  @ApiOkResponse({ description: 'Paginated notifications with stats and the email transport' })
  list(@Query() query: AdminNotificationQueryDto) {
    return this.notifications.listForAdmin(query);
  }

  // Declared before `:id/read` so "stats" is never read as an id.
  @Get('stats')
  @ApiOperation({ summary: 'Counts for the console cards' })
  @ApiOkResponse({ description: 'Totals, unread, email outcomes, last 24h' })
  stats(@Query() query: AdminNotificationQueryDto) {
    return this.notifications.statsForAdmin(query.audience);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a shop notification read' })
  @ApiOkResponse({ description: 'The updated notification' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  markRead(@Param('id') id: string) {
    return this.notifications.markReadAsAdmin(id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-attempt the email of a failed or skipped notification' })
  @ApiOkResponse({ description: 'The notification with its new delivery state' })
  @ApiBadRequestResponse({ description: 'Email is not configured on this server' })
  @ApiConflictResponse({ description: 'Already delivered' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  retry(@Param('id') id: string) {
    return this.notifications.retry(id);
  }
}
