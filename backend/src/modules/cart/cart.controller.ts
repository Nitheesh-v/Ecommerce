// src/modules/cart/cart.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { ActiveAccountGuard } from '../auth/guards/active-account.guard.js';
import { CartService } from './cart.service.js';
import { AddCartItemDto, ApplyCartCouponDto, UpdateCartItemDto } from './dto/cart.dto.js';

/**
 * The signed-in customer's cart — `/api/cart`.
 *
 * Every route returns **the whole cart in one shape**, including recomputed
 * totals, so the client never has to guess a price or patch a local total after a
 * mutation. A customer with no cart document simply gets an empty cart with zeroed
 * totals; there is no "cart not found" state.
 */
@ApiTags('cart')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@Controller('cart')
@UseGuards(ActiveAccountGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOperation({ summary: 'My cart with live prices and totals' })
  @ApiResponse({ description: 'The cart (empty when nothing has been added yet)' })
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.cart.getForUser(user);
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add a product',
    description:
      'Adding a product that is already in the cart increments its quantity. The quantity is ' +
      'validated against live stock, and the coupon already applied is re-priced against the ' +
      'new cart.',
  })
  @ApiResponse({ description: 'The updated cart' })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Not enough stock / product unavailable',
  })
  addItem(@Body() dto: AddCartItemDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cart.addItem(user, dto);
  }

  @Patch('items/:productId')
  @ApiOperation({
    summary: 'Set a line quantity',
    description: '`quantity: 0` removes the line — the same thing as the DELETE route.',
  })
  @ApiParam({ name: 'productId' })
  @ApiResponse({ description: 'The updated cart' })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: 'Not enough stock' })
  updateItem(
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cart.updateItem(user, productId, dto.quantity);
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: 'Remove one product' })
  @ApiParam({ name: 'productId' })
  @ApiResponse({ description: 'The updated cart' })
  removeItem(@Param('productId') productId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cart.removeItem(user, productId);
  }

  @Delete()
  @ApiOperation({ summary: 'Empty the cart (the coupon goes with it)' })
  @ApiResponse({ description: 'The empty cart' })
  clear(@CurrentUser() user: AuthenticatedUser) {
    return this.cart.clear(user);
  }

  @Post('coupon')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Apply a coupon',
    description:
      'The code is validated against the current cart before it is stored, so an invalid ' +
      'coupon is rejected here rather than at checkout.',
  })
  @ApiResponse({ description: 'The cart with the coupon applied' })
  applyCoupon(@Body() dto: ApplyCartCouponDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cart.applyCoupon(user, dto.code);
  }

  @Delete('coupon')
  @ApiOperation({ summary: 'Remove the coupon' })
  @ApiResponse({ description: 'The cart without a coupon' })
  removeCoupon(@CurrentUser() user: AuthenticatedUser) {
    return this.cart.removeCoupon(user);
  }
}
