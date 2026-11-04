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
import {
  DISCOUNT_TYPES,
  OFFER_LIFECYCLE_STATUSES,
  REDEMPTION_STATUSES,
} from '../schemas/offer.schema.js';
import type {
  DiscountType,
  OfferLifecycleStatus,
  RedemptionStatus,
} from '../schemas/offer.schema.js';

export const OFFER_SORT_FIELDS = ['createdAt', 'startsAt', 'endsAt', 'usageCount', 'name'] as const;
export type OfferSortField = (typeof OFFER_SORT_FIELDS)[number];

export const REDEMPTION_SORT_KEYS = ['reservedAt', 'redeemedAt', 'discountAmount'] as const;
export type RedemptionSortField = (typeof REDEMPTION_SORT_KEYS)[number];

/** Admin offer list filters. */
export class OffersQueryDto {
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

  @ApiPropertyOptional({ description: 'Offer name or coupon code' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: OFFER_LIFECYCLE_STATUSES })
  @IsIn(OFFER_LIFECYCLE_STATUSES)
  @IsOptional()
  status?: OfferLifecycleStatus;

  @ApiPropertyOptional({ enum: DISCOUNT_TYPES })
  @IsIn(DISCOUNT_TYPES)
  @IsOptional()
  type?: DiscountType;

  @ApiPropertyOptional({ description: 'ISO date — running on/after this instant' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  from?: Date;

  @ApiPropertyOptional({ description: 'ISO date — running on/before this instant' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  to?: Date;

  @ApiPropertyOptional({ enum: OFFER_SORT_FIELDS, default: 'createdAt' })
  @IsIn(OFFER_SORT_FIELDS)
  @IsOptional()
  sortBy: OfferSortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: 'asc' | 'desc' = 'desc';
}

/** Admin redemption list filters (all offers, or one offer). */
export class RedemptionsQueryDto {
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

  @ApiPropertyOptional({ description: 'Coupon code, order number or customer email' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: REDEMPTION_STATUSES })
  @IsIn(REDEMPTION_STATUSES)
  @IsOptional()
  status?: RedemptionStatus;

  @ApiPropertyOptional({ description: 'Limit to one offer' })
  @IsMongoId()
  @IsOptional()
  offerId?: string;

  @ApiPropertyOptional({ description: 'ISO date — reserved on/after' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  from?: Date;

  @ApiPropertyOptional({ description: 'ISO date — reserved on/before' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  to?: Date;

  @ApiPropertyOptional({ enum: REDEMPTION_SORT_KEYS, default: 'reservedAt' })
  @IsIn(REDEMPTION_SORT_KEYS)
  @IsOptional()
  sortBy: RedemptionSortField = 'reservedAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: 'asc' | 'desc' = 'desc';
}

/** Public list of active offers. */
export class PublicOffersQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive search over name, code and description' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 20;
}
