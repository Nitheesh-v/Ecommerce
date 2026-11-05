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
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { ActiveAccountGuard } from '../auth/guards/active-account.guard.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { MyReviewsQueryDto, ProductReviewsQueryDto } from './dto/reviews-query.dto.js';
import { ReviewsService } from './reviews.service.js';

/**
 * Reviews on a product — `/api/products/:idOrSlug/reviews`.
 *
 * Reading is public and returns approved rows only. Writing requires a session
 * *and* a delivered order containing the product; the customer, the verifying order
 * and the `pending` status are all decided server-side, so the payload cannot
 * publish anything.
 */
@ApiTags('reviews')
@Controller('products/:idOrSlug/reviews')
export class ProductReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Approved reviews for a product (newest first)' })
  @ApiOkResponse({ description: 'Paginated public reviews' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'Unknown product' })
  list(
    @Param('idOrSlug') idOrSlug: string,
    @Query() query: ProductReviewsQueryDto,
  ) {
    return this.reviews.productReviews(idOrSlug, query);
  }

  @Public()
  @Get('summary')
  @ApiOperation({ summary: 'Rating summary: average, count and star distribution' })
  @ApiOkResponse({ description: 'Approved-only rating maths' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'Unknown product' })
  summary(@Param('idOrSlug') idOrSlug: string) {
    return this.reviews.productRating(idOrSlug);
  }

  @Get('eligibility')
  @UseGuards(ActiveAccountGuard)
  @ApiOperation({ summary: 'Whether the signed-in customer may review this product' })
  @ApiOkResponse({ description: 'Eligibility plus the state of an existing review' })
  eligibility(
    @Param('idOrSlug') idOrSlug: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.eligibility(idOrSlug, user);
  }

  @Post()
  @UseGuards(ActiveAccountGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a review (verified buyers only, lands in moderation)',
    description:
      'The global rate limiter applies. Spam is additionally bounded by the ' +
      'one-review-per-customer-per-product rule and by moderation: nothing is public ' +
      'until an admin approves it.',
  })
  @ApiCreatedResponse({ description: 'The review, stored as `pending`' })
  @ApiForbiddenResponse({
    type: ApiErrorResponseDto,
    description: 'No delivered order containing this product',
  })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'This customer already reviewed this product',
  })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Invalid review body' })
  create(
    @Param('idOrSlug') idOrSlug: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.create(idOrSlug, dto, user);
  }
}

/** A customer's own reviews — `/api/reviews/mine`. */
@ApiTags('reviews')
@Controller('reviews')
export class CustomerReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('mine')
  @UseGuards(ActiveAccountGuard)
  @ApiOperation({ summary: 'Reviews written by the signed-in customer, with status' })
  @ApiOkResponse({ description: 'Paginated reviews (any status)' })
  mine(@CurrentUser() user: AuthenticatedUser, @Query() query: MyReviewsQueryDto) {
    return this.reviews.myReviews(user, query);
  }
}
