import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
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
import { AdminPaymentsQueryDto } from './dto/payments-query.dto.js';
import { RefundPaymentDto } from './dto/payment-actions.dto.js';
import { PaymentsService } from './payments.service.js';

/**
 * Payment console API — `/api/admin/payments`.
 *
 * Read-only apart from refunds. There is no endpoint to edit a payment status:
 * money state changes only through verified gateway events, and the refund route
 * always calls the gateway (it can never fabricate a refund reference).
 */
@ApiTags('admin-payments')
@ApiBearerAuth()
@Roles(Role.Admin)
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Admin role required' })
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'List transactions (search, filter, sort, paginate)' })
  @ApiOkResponse({ description: 'Paginated gateway transactions' })
  list(@Query() query: AdminPaymentsQueryDto) {
    return this.paymentsService.list(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Transaction totals (total, successful, pending, failed, refunded)' })
  summary() {
    return this.paymentsService.summary();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Transaction detail with order, customer, refunds and events' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'Unknown payment id' })
  detail(@Param('id') id: string) {
    return this.paymentsService.detail(id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Payment event log and timeline' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'Unknown payment id' })
  history(@Param('id') id: string) {
    return this.paymentsService.history(id);
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Refund (part of) a captured payment through the gateway' })
  @ApiCreatedResponse({ description: 'The recorded refund and the updated payment' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Amount exceeds the refundable total' })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Not refundable, already fully refunded, or a refund is pending',
  })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'Unknown payment id' })
  refund(
    @Param('id') id: string,
    @Body() dto: RefundPaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.paymentsService.refundPayment(id, dto, actor);
  }
}
