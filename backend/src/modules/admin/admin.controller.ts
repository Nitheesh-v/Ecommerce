import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import { Role } from '../../common/enums/role.enum.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardQueryDto } from './dto/dashboard-query.dto.js';

/**
 * Admin-only surface.
 *
 * `@Roles(Role.Admin)` is enforced by the global `RolesGuard`, so a customer
 * token gets 403 from the server — hiding the admin UI is not the protection.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.Admin)
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Admin role required' })
@Controller('admin')
export class AdminController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard/overview')
  @ApiOperation({ summary: 'Aggregated dashboard data for the selected date range' })
  @ApiOkResponse({ description: 'Metrics, charts and recent activity in one payload' })
  overview(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getOverview(query);
  }
}
