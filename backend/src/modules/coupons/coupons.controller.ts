import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { CouponsService } from './coupons.service.js';
import { ValidateCouponDto } from './dto/create-offer.dto.js';
import { PublicOffersQueryDto } from './dto/offers-query.dto.js';

/**
 * Coupon validation — `POST /api/coupons/validate`.
 *
 * Public because a cart can exist before sign-in, but deliberately read-only: it
 * claims nothing, writes nothing and returns only what the server itself computed
 * from product records. A stricter per-route limit makes guessing codes unattractive
 * (an unknown code and a disabled one produce the same message).
 */
@ApiTags('coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a coupon against a cart and preview the totals' })
  @ApiOkResponse({ description: 'Server-computed discount and totals' })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: 'Unknown, inactive, expired, ineligible or already-used coupon',
  })
  validate(
    @Body() dto: ValidateCouponDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    return this.coupons.validate(dto, user ?? null);
  }
}

/**
 * Public offers page — `GET /api/offers/active`.
 *
 * Returns only offers that are usable right now *and* marked customer-visible.
 * Limits, counters, the active switch and audit fields are internal and never
 * appear in this projection.
 */
@ApiTags('offers')
@Controller('offers')
export class PublicOffersController {
  constructor(private readonly coupons: CouponsService) {}

  @Public()
  @Get('active')
  @ApiOperation({ summary: 'Active, customer-visible offers' })
  @ApiOkResponse({ description: 'Currently usable offers' })
  active(@Query() query: PublicOffersQueryDto) {
    return this.coupons.publicOffers(query);
  }
}
