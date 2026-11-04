import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { SkipResponseEnvelope } from '../../common/decorators/skip-response-envelope.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
// Value import: the ValidationPipe needs the class at runtime to apply defaults
// and transformations (`import type` would erase it and silently skip both).
import { OrdersQueryDto } from '../orders/dto/orders-query.dto.js';
import { CustomersQueryDto } from './dto/customers-query.dto.js';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto.js';
import { CustomersService } from './customers.service.js';

/**
 * Customer management console API — `/api/admin/customers`.
 *
 * `@Roles(Role.Admin)` is enforced by the global `RolesGuard` on top of
 * `JwtAuthGuard`, so anonymous calls are 401 and customers are 403. The client
 * gate in the console is UX only; these decorators are the security boundary.
 */
@ApiTags('admin-customers')
@ApiBearerAuth()
@Roles(Role.Admin)
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Admin role required' })
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'List customers (search, filter, sort, paginate)' })
  @ApiOkResponse({ description: 'Paginated customers with spending metrics' })
  list(@Query() query: CustomersQueryDto) {
    return this.customersService.list(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Customer analytics (counts, repeat buyers, average spend)' })
  summary() {
    return this.customersService.overview();
  }

  @Get('export')
  @SkipResponseEnvelope()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export the filtered customer list as CSV' })
  async export(@Query() query: CustomersQueryDto, @Res() response: Response) {
    const csv = await this.customersService.exportCsv(query);
    const filename = `customers-${new Date().toISOString().slice(0, 10)}.csv`;

    // Attachment, not inline: an export lands in a file, never renders in a tab.
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.send(csv);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Customer profile with metrics, addresses and activity' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'Unknown customer id' })
  detail(@Param('id') id: string) {
    return this.customersService.detail(id);
  }

  @Get(':id/orders')
  @ApiOperation({ summary: 'Order history for one customer' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'Unknown customer id' })
  orders(@Param('id') id: string, @Query() query: OrdersQueryDto) {
    return this.customersService.orders(id, query);
  }

  @Get(':id/summary')
  @ApiOperation({ summary: 'Spending and order summary for one customer' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'Unknown customer id' })
  customerSummary(@Param('id') id: string) {
    return this.customersService.summary(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Change account status (active / suspended / deactivated) — audited',
  })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'The customer changed in the meantime',
  })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'Unknown customer id' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.customersService.changeStatus(id, dto, actor);
  }
}
