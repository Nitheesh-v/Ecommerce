// src/modules/checkout/checkout.controller.ts

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
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
import { AllowGuest } from '../../common/decorators/allow-guest.decorator.js';
import { CartId } from '../../common/decorators/cart-id.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import type { RequestWithContext } from '../../common/interfaces/request-with-context.interface.js';
import type { CartOwner } from '../cart/cart.service.js';
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
@AllowGuest()
@UseGuards(ActiveAccountGuard)
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  /** The guard has already resolved who this is: an account, or a guest's cart. */
  private owner(request: RequestWithContext, cartId: string): CartOwner {
    return { cartId, user: request.user ?? null };
  }

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
  preview(
    @Body() dto: CheckoutPreviewDto,
    @Req() request: RequestWithContext,
    @CartId() cartId: string,
  ) {
    return this.checkout.preview(this.owner(request, cartId), dto);
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
  place(
    @Body() dto: PlaceOrderDto,
    @Req() request: RequestWithContext,
    @CartId() cartId: string,
  ) {
    return this.checkout.place(this.owner(request, cartId), dto);
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
  // Signed-in only: a guest's payment is confirmed from `/checkout/verify-payment`
  // with no account, so that route reads the identity from the request rather than
  // requiring one. See `CheckoutService.confirmPayment`.
  verifyPayment(
    @Body() dto: VerifyPaymentDto,
    @Req() request: RequestWithContext,
    @CartId() cartId: string,
  ) {
    return this.checkout.confirmPayment(this.owner(request, cartId), dto);
  }
}
