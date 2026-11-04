import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { AdminCreateOrderDto } from './dto/create-order.dto.js';
import {
  CancelOrderDto,
  CreateRefundDto,
  RequestReturnDto,
  UpdateOrderStatusDto,
  UpdatePaymentDto,
  UpdateRefundDto,
  UpdateReturnDto,
  UpdateShippingDto,
} from './dto/order-actions.dto.js';
import { OrdersQueryDto } from './dto/orders-query.dto.js';
import { OrdersService } from './orders.service.js';

/**
 * Admin order console — `/api/admin/orders`.
 *
 * Every route is admin-only; customers use `/api/orders`, which scopes reads to
 * their own account. Status changes go through the state machine in
 * `order-status.ts`; cancellation, returns and refunds have dedicated endpoints
 * because each of them has stock or money side effects that a plain status write
 * would bypass.
 */
@ApiTags('admin/orders')
@ApiBearerAuth()
@Roles(Role.Admin)
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Admin role required' })
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({
    summary: 'List orders (search by number/customer, status, payment, method, date, sort)',
  })
  @ApiOkResponse({ description: 'Paginated orders in `{ data, meta }`' })
  list(@Query() query: OrdersQueryDto) {
    return this.ordersService.list(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an order manually (phone sale, admin entry)' })
  @ApiCreatedResponse({ description: 'The created order with server-computed totals' })
  create(
    @Body() dto: AdminCreateOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.createManual(actor, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Order detail (snapshots, totals, timeline)' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  detail(@Param('id') id: string) {
    return this.ordersService.getForAdmin(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Transition the order status (validated state machine)' })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Illegal transition, or the order changed meanwhile',
  })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.updateStatus(id, dto, actor);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel an eligible order, restore stock once and record the refund obligation',
  })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Already cancelled, already shipped, or changed meanwhile',
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.cancelOrder(id, dto, actor);
  }

  @Patch(':id/shipping')
  @ApiOperation({ summary: 'Set provider, tracking number/URL, shipping dates and notes' })
  updateShipping(
    @Param('id') id: string,
    @Body() dto: UpdateShippingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.updateShipping(id, dto, actor);
  }

  @Patch(':id/payment')
  @ApiOperation({
    summary: 'Record a payment manually (bank transfer / COD collected) — never from the client',
  })
  updatePayment(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.updatePayment(id, dto, actor);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Append-only order history, newest first' })
  history(@Param('id') id: string) {
    return this.ordersService.history(id);
  }

  @Get(':id/invoice')
  @ApiOperation({ summary: 'Invoice built from the immutable order snapshot' })
  invoice(@Param('id') id: string) {
    return this.ordersService.invoice(id);
  }

  @Post(':id/refunds')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Queue a refund (capped by the paid amount)' })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Nothing left to refund',
  })
  refund(
    @Param('id') id: string,
    @Body() dto: CreateRefundDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.createRefund(id, dto, actor);
  }

  @Patch(':id/refunds/:refundId')
  @ApiOperation({ summary: 'Mark a queued refund processed or failed (once only)' })
  updateRefund(
    @Param('id') id: string,
    @Param('refundId') refundId: string,
    @Body() dto: UpdateRefundDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.updateRefund(id, refundId, dto, actor);
  }

  @Post(':id/returns')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Raise a return request on a delivered order' })
  requestReturn(
    @Param('id') id: string,
    @Body() dto: RequestReturnDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.requestReturn(id, dto, actor);
  }

  @Patch(':id/returns/:returnId')
  @ApiOperation({
    summary: 'Return workflow: approve / reject / receive / inspect (restock) / complete',
  })
  updateReturn(
    @Param('id') id: string,
    @Param('returnId') returnId: string,
    @Body() dto: UpdateReturnDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.ordersService.updateReturn(id, returnId, dto, actor);
  }
}
