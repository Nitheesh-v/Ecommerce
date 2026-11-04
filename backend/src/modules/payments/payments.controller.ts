import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { ActiveAccountGuard } from '../auth/guards/active-account.guard.js';
import {
  CreatePaymentOrderDto,
  VerifyPaymentDto,
} from './dto/payment-actions.dto.js';
import { PaymentsService } from './payments.service.js';

/**
 * Online payments — `/api/payments`.
 *
 * Three very different callers:
 * - `config` is public (publishable key only, so the store can decide whether to
 *   offer checkout);
 * - `create-order` / `verify` belong to the signed-in customer who owns the order
 *   (`ActiveAccountGuard` blocks suspended accounts);
 * - `webhook` is public **by necessity** (the gateway cannot log in) and is
 *   authenticated by an HMAC over the raw body instead.
 *
 * There is deliberately no route that sets a payment status.
 */
@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('config')
  @Public()
  @ApiOperation({ summary: 'Checkout configuration (publishable key only)' })
  @ApiOkResponse({ description: 'Provider, test-mode flag and public key id' })
  config() {
    return this.paymentsService.checkoutConfig();
  }

  @Post('create-order')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(ActiveAccountGuard)
  @ApiOperation({ summary: 'Start a payment attempt for one of my orders' })
  @ApiCreatedResponse({ description: 'Gateway order id + checkout prefill' })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: 'Order already paid' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  createOrder(
    @Body() dto: CreatePaymentOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.createPaymentOrder(user, dto);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(ActiveAccountGuard)
  @ApiOperation({ summary: 'Verify a checkout callback (signature + gateway fetch)' })
  @ApiOkResponse({ description: 'Verified payment status' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Invalid signature or amount' })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: 'Payment already finalised' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  verify(@Body() dto: VerifyPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.verifyPayment(user, dto);
  }

  /**
   * Gateway webhook.
   *
   * `@SkipThrottle()` because a legitimate retry burst would otherwise be
   * rate-limited by IP, and a dropped webhook is a payment the console never
   * learns about. The signature check is the real gate.
   */
  @Post('webhook')
  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gateway webhook (HMAC verified over the raw body)' })
  @ApiOkResponse({ description: '`{ received, duplicate, handled, eventId }`' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Bad signature or payload' })
  webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Headers('x-razorpay-event-id') eventId: string | undefined,
  ) {
    return this.paymentsService.handleWebhook(request.rawBody, signature, eventId);
  }
}
