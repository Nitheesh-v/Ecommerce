import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ActiveAccountGuard } from '../auth/guards/active-account.guard.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { CancelOrderDto, RequestReturnDto } from './dto/order-actions.dto.js';
import { OrdersQueryDto } from './dto/orders-query.dto.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrdersService } from './orders.service.js';

/**
 * Customer-facing orders — `/api/orders`.
 *
 * Authenticated (no `@Public`), but **not** role-restricted: admins may use these
 * routes too, and every read is scoped to the caller. Another customer's order is
 * a 404, so ids cannot be probed.
 *
 * This is the checkout foundation: there is no cart UI yet, so the storefront will
 * call `POST /api/orders` with product ids and quantities once Phase 10 lands.
 * Prices are never accepted from the request.
 *
 * `ActiveAccountGuard` re-reads the account on every call: a suspended customer's
 * existing access token stops working here immediately, instead of lingering until
 * it expires.
 */
@ApiTags('orders')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@Controller('orders')
@UseGuards(ActiveAccountGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'My orders (paginated, filterable)' })
  @ApiOkResponse({ description: 'Paginated orders belonging to the caller' })
  list(@Query() query: OrdersQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.listForCustomer(user, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Place an order (server-priced; idempotent with `idempotencyKey`)',
  })
  @ApiCreatedResponse({ description: '`{ order, created }`' })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Insufficient stock, or the order was already created',
  })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.createForCustomer(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'My order detail' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'Not your order' })
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.getForCustomer(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel my order while it has not shipped' })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: 'Not cancellable any more' })
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Ownership first (404 for someone else's order), then the cancellation rules.
    await this.ordersService.getForCustomer(id, user);

    return this.ordersService.cancelOrder(id, dto, user);
  }

  @Post(':id/returns')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request a return for a delivered order' })
  requestReturn(
    @Param('id') id: string,
    @Body() dto: RequestReturnDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.requestReturn(id, dto, user);
  }

  @Get(':id/invoice')
  @ApiOperation({ summary: 'Invoice for one of my orders' })
  invoice(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.invoiceForCustomer(id, user);
  }
}
