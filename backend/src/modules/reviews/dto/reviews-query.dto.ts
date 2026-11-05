import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { REVIEW_STATUSES } from '../schemas/review.schema.js';
import type { ReviewStatus } from '../schemas/review.schema.js';

export const REVIEW_SORT_FIELDS = ['createdAt', 'rating', 'status'] as const;
export type ReviewSortField = (typeof REVIEW_SORT_FIELDS)[number];

/** Admin review queue: every filter the console offers. */
export class ReviewsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Customer, order number or review text' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: REVIEW_STATUSES })
  @IsIn(REVIEW_STATUSES)
  @IsOptional()
  status?: ReviewStatus;

  @ApiPropertyOptional({ description: 'Restrict to one product' })
  @IsMongoId()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @ApiPropertyOptional({ description: 'ISO date — submitted on/after' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  from?: Date;

  @ApiPropertyOptional({ description: 'ISO date — submitted on/before' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  to?: Date;

  @ApiPropertyOptional({ enum: REVIEW_SORT_FIELDS, default: 'createdAt' })
  @IsIn(REVIEW_SORT_FIELDS)
  @IsOptional()
  sortBy: ReviewSortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: 'asc' | 'desc' = 'desc';
}

/**
 * Storefront review list.
 *
 * Deliberately narrower than the admin query: no `status` (the API forces
 * `approved`) and no customer/order search — a shopper can filter by stars and page
 * through, and nothing else.
 */
export class ProductReviewsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit: number = 10;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Only reviews with this rating' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @ApiPropertyOptional({ enum: REVIEW_SORT_FIELDS, default: 'createdAt' })
  @IsIn(REVIEW_SORT_FIELDS)
  @IsOptional()
  sortBy: ReviewSortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: 'asc' | 'desc' = 'desc';
}

/** A customer's own reviews. */
export class MyReviewsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 20;
}
