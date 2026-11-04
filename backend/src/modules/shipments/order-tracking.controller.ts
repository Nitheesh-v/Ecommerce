import { Controller, Get, Param, UseGuards } from '@nestjs/common';
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
import { ShipmentsService } from './shipments.service.js';

/**
 * Customer parcel tracking — `/api/orders/:id/tracking`.
 *
 * Authenticated and owner-scoped: someone else's order is a `404`, so ids cannot
 * be probed. The projection is customer-safe by construction (see
 * `ShipmentsService.tracking`), and nothing here can change a status.
 */
@ApiTags('orders')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@Controller('orders')
@UseGuards(ActiveAccountGuard)
export class OrderTrackingController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get(':id/tracking')
  @ApiOperation({ summary: 'Tracking for one of my orders' })
  @ApiOkResponse({ description: 'Shipment status, courier, progress steps and events' })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: "Not your order, or no shipment yet",
  })
  tracking(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.shipmentsService.tracking(id, user);
  }
}
