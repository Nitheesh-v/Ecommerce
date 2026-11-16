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
  Req,
  UseGuards,
  UnauthorizedException,
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
import { AllowGuest } from '../../common/decorators/allow-guest.decorator.js';
import { CartId } from '../../common/decorators/cart-id.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import type { RequestWithContext } from '../../common/interfaces/request-with-context.interface.js';
import { guestCartId, isWellFormedGuestToken } from '../../common/utils/cart-identity.util.js';
import { ActiveAccountGuard } from '../auth/guards/active-account.guard.js';
import { CartService } from './cart.service.js';
import type { CartOwner } from './cart.service.js';
import { AddCartItemDto, ApplyCartCouponDto, MergeGuestCartDto, UpdateCartItemDto } from './dto/cart.dto.js';

/**
 * The signed-in customer's cart — `/api/cart`.
 *
 * Every route returns **the whole cart in one shape**, including recomputed
 * totals, so the client never has to guess a price or patch a local total after a
 * mutation. A customer with no cart document simply gets an empty cart with zeroed
 * totals; there is no "cart not found" state.
 *
 * Every route is `@AllowGuest()`: a signed-in caller is identified by their token,
 * an anonymous one by the opaque cart id they send in `x-cart-id`. The guard
 * attaches `cartId` either way, so nothing below has to care which it is — except
 * `merge`, which exists precisely to hand a guest's basket to their new account.
 */
@ApiTags('cart')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@Controller('cart')
@AllowGuest()
@UseGuards(ActiveAccountGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  /** One shape for both callers: the guard has already decided which cart this is. */
  private owner(request: RequestWithContext, cartId: string): CartOwner {
    return { cartId, user: request.user ?? null };
  }

  @Get()
  @ApiOperation({ summary: 'My cart with live prices and totals' })
  @ApiResponse({ description: 'The cart (empty when nothing has been added yet)' })
  get(@Req() request: RequestWithContext, @CartId() cartId: string) {
    return this.cart.getForOwner(this.owner(request, cartId));
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
  addItem(
    @Body() dto: AddCartItemDto,
    @Req() request: RequestWithContext,
    @CartId() cartId: string,
  ) {
    return this.cart.addItem(this.owner(request, cartId), dto);
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
    @Req() request: RequestWithContext,
    @CartId() cartId: string,
  ) {
    return this.cart.updateItem(this.owner(request, cartId), productId, dto.quantity);
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: 'Remove one product' })
  @ApiParam({ name: 'productId' })
  @ApiResponse({ description: 'The updated cart' })
  removeItem(
    @Param('productId') productId: string,
    @Req() request: RequestWithContext,
    @CartId() cartId: string,
  ) {
    return this.cart.removeItem(this.owner(request, cartId), productId);
  }

  @Delete()
  @ApiOperation({ summary: 'Empty the cart (the coupon goes with it)' })
  @ApiResponse({ description: 'The empty cart' })
  clear(@Req() request: RequestWithContext, @CartId() cartId: string) {
    return this.cart.clear(this.owner(request, cartId));
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
  applyCoupon(
    @Body() dto: ApplyCartCouponDto,
    @Req() request: RequestWithContext,
    @CartId() cartId: string,
  ) {
    return this.cart.applyCoupon(this.owner(request, cartId), dto.code);
  }

  @Delete('coupon')
  @ApiOperation({ summary: 'Remove the coupon' })
  @ApiResponse({ description: 'The cart without a coupon' })
  removeCoupon(@Req() request: RequestWithContext, @CartId() cartId: string) {
    return this.cart.removeCoupon(this.owner(request, cartId));
  }

  /**
   * Signing in with a guest cart in the browser.
   *
   * Signed-in only, and the guest id is validated before use: without the format
   * check a caller could name any string and probe for somebody else's basket. The
   * merge itself re-reads both carts through the repository, so a retired or
   * already-merged guest cart contributes nothing.
   */
  @Post('merge')
  @HttpCode(HttpStatus.OK)
  // `@AllowGuest()` is on the controller, but a merge needs both sides to be real,
  // so this route explicitly requires the account.
  @ApiOperation({
    summary: 'Merge this browser’s guest cart into the signed-in account',
    description:
      'Quantities are added per product and clamped to live stock. The guest cart is ' +
      'retired so its token cannot be replayed. Returns the merged cart.',
  })
  @ApiResponse({ description: 'The account’s cart after the merge' })
  merge(
    @Body() dto: MergeGuestCartDto,
    @Req() request: RequestWithContext,
    @CartId() cartId: string,
  ) {
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Sign in to merge a guest cart');
    }

    if (!isWellFormedGuestToken(dto.guestCartId)) {
      // Not a format we ever issued — answer with the account's cart unchanged
      // rather than making the caller handle an error for a no-op.
      return this.cart.getForOwner({ cartId, user });
    }

    return this.cart.mergeGuestCart({ cartId, user }, guestCartId(dto.guestCartId));
  }
}
