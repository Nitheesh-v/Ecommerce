// src/modules/notifications/notifications.controller.ts

import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { ActiveAccountGuard } from '../auth/guards/active-account.guard.js';
import { CustomerNotificationQueryDto } from './dto/notification.dto.js';
import { NotificationsService } from './notifications.service.js';

/**
 * The customer's own notification feed — `/api/notifications`.
 *
 * Scoped to the caller by construction: every query carries `userId`, and another
 * customer's notification id is a `404` rather than a `403` (no existence leak).
 * Notifications are written by the server only; there is no create route, because a
 * client that can mint notifications can mint fake order confirmations.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@Controller('notifications')
@UseGuards(ActiveAccountGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'My notifications (newest first, unread count included)' })
  @ApiOkResponse({ description: 'Paginated notifications plus `unread`' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CustomerNotificationQueryDto,
  ) {
    return this.notifications.listMine(user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread badge count' })
  @ApiOkResponse({ description: '`{ unread: number }`' })
  unread(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark every notification read' })
  @ApiOkResponse({ description: '`{ updated: number }`' })
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark one notification read' })
  @ApiOkResponse({ description: 'The updated notification' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markRead(user.id, id);
  }
}
