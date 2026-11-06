// src/modules/checkout/checkout.controller.ts

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { ActiveAccountGuard } from '../auth/guards/active-account.guard.js';
import { VerifyPaymentDto } from '../payments/dto/payment-actions.dto.js';
import { CheckoutService } from './checkout.service.js';
import { CheckoutPreviewDto, PlaceOrderDto } from './dto/checkout.dto.js';

/**
 * Checkout — `/api/checkout`.
 *
 * Three steps, in this order: **preview** (what will this cost, may I pay that way),
 * **place** (do it), **verify-payment** (the gateway's callback). Every route is
 * signed-in-only and scoped to the caller's own cart, addresses and orders.
 *
 * The preview is a genuine dry run — it reserves nothing and creates nothing — so the
 * browser can call it on every change of address or payment method without side
 * effects.
 */
@ApiTags('checkout')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@Controller('checkout')
@UseGuards(ActiveAccountGuard)
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Price the cart for a chosen address and payment method',
    description:
      'Revalidates address ownership, stock, the applied coupon and the chosen payment ' +
      'method. Creates no order and reserves no stock.',
  })
  @ApiResponse({ description: 'Items, price breakdown and payment options' })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Stock gone, coupon no longer valid, or that payment method is unavailable',
  })
  preview(@Body() dto: CheckoutPreviewDto, @CurrentUser() user: AuthenticatedUser) {
    return this.checkout.preview(user, dto);
  }

  @Post('place')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Place the order',
    description:
      'Revalidates everything, writes the order, reserves stock, spends the coupon and ' +
      'empties the cart. Online orders also get a gateway order id to pay against.',
  })
  @ApiResponse({ description: 'Order id, number and (for online) the payment hand-off' })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Not enough stock, coupon expired, or the COD limit was exceeded',
  })
  place(@Body() dto: PlaceOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.checkout.place(user, dto);
  }

  @Post('verify-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm a gateway payment and confirm its order',
    description:
      'The signature is checked, the payment is re-read from the gateway, and only then is ' +
      'the order marked paid. Replaying a successful verification is idempotent.',
  })
  @ApiResponse({ description: 'Verification outcome and the order it belongs to' })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorResponseDto,
    description: 'The payment could not be verified',
  })
  verifyPayment(@Body() dto: VerifyPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.checkout.confirmPayment(user, dto);
  }
}
