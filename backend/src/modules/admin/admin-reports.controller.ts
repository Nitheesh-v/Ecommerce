import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { SkipResponseEnvelope } from '../../common/decorators/skip-response-envelope.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import { Role } from '../../common/enums/role.enum.js';
import { DashboardQueryDto } from './dto/dashboard-query.dto.js';
import { ReportsService } from './reports.service.js';

/**
 * Reports — `/api/admin/reports`.
 *
 * Two reports (sales, customers), each with a JSON view for the screen and a CSV
 * export of the same numbers. Exports reuse the customers/redemptions convention:
 * an attachment with today's date in the filename, streamed through `@Res()` so the
 * JSON envelope wrapper stays out of the way.
 */
@ApiTags('admin-reports')
@ApiBearerAuth()
@Roles(Role.Admin)
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Admin role required' })
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  @ApiOperation({
    summary: 'Sales report: revenue, orders, averages, series, status mix, categories, top products',
  })
  @ApiOkResponse({ description: 'Sales figures for the selected range' })
  sales(@Query() query: DashboardQueryDto) {
    return this.reports.salesReport(query);
  }

  @Get('customers')
  @ApiOperation({
    summary: 'Customer report: new vs repeat, repeat rate, orders per customer, top buyers',
  })
  @ApiOkResponse({ description: 'Customer figures for the selected range' })
  customers(@Query() query: DashboardQueryDto) {
    return this.reports.customerReport(query);
  }

  @Get('sales/export')
  @SkipResponseEnvelope()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export the sales report as CSV' })
  async salesExport(@Query() query: DashboardQueryDto, @Res() response: Response) {
    const csv = await this.reports.salesCsv(query);
    const filename = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`;

    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.send(csv);
  }

  @Get('customers/export')
  @SkipResponseEnvelope()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export the customer report as CSV' })
  async customersExport(@Query() query: DashboardQueryDto, @Res() response: Response) {
    const csv = await this.reports.customersCsv(query);
    const filename = `customer-report-${new Date().toISOString().slice(0, 10)}.csv`;

    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.send(csv);
  }
}
