import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DISCOUNT_TYPES } from '../schemas/offer.schema.js';
import type { DiscountType } from '../schemas/offer.schema.js';

/** Codes are typed by humans: uppercase, no spaces, at least 3 characters. */
export const COUPON_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/;

const ID_LIST = { each: true, message: 'Product and category ids must be valid ids' };

export class CreateOfferDto {
  @ApiProperty({ maxLength: 120, example: 'Diwali 20% off' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'DIWALI20', description: 'Case-insensitive unique code' })
  @IsString()
  @Matches(COUPON_CODE_PATTERN, {
    message:
      'Code must be 3–32 characters: letters, digits, hyphen or underscore (no spaces). It is stored upper-cased.',
  })
  code!: string;

  @ApiProperty({ enum: DISCOUNT_TYPES })
  @IsIn(DISCOUNT_TYPES)
  type!: DiscountType;

  @ApiProperty({
    description: 'Percentage points (1–100), minor units for a fixed amount, or 0 for free shipping',
  })
  @IsInt()
  @Min(0)
  value!: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Minimum eligible goods value, minor units' })
  @IsInt()
  @Min(0)
  @IsOptional()
  minCartValue?: number;

  @ApiPropertyOptional({
    minimum: 1,
    description: 'Cap for percentage offers, minor units',
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxDiscount?: number;

  @ApiProperty({ description: 'When the coupon starts working' })
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiProperty({ description: 'When it stops working' })
  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  @ApiPropertyOptional({ minimum: 1, description: 'Omit for unlimited uses' })
  @IsInt()
  @Min(1)
  @IsOptional()
  totalUsageLimit?: number;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  perCustomerLimit?: number;

  @ApiPropertyOptional({ type: [String], description: 'Only these products qualify' })
  @IsArray()
  @ArrayMaxSize(500)
  @IsMongoId(ID_LIST)
  @IsOptional()
  applicableProductIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Only these categories qualify' })
  @IsArray()
  @ArrayMaxSize(500)
  @IsMongoId(ID_LIST)
  @IsOptional()
  applicableCategoryIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsMongoId(ID_LIST)
  @IsOptional()
  excludedProductIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsMongoId(ID_LIST)
  @IsOptional()
  excludedCategoryIds?: string[];

  @ApiPropertyOptional({ default: true, description: 'Show on the public /offers page' })
  @IsBoolean()
  @IsOptional()
  customerVisible?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/**
 * Edit payload.
 *
 * Every field is optional, but the merged result is re-validated as a whole — an
 * edit cannot leave an offer in a state a create would have rejected (e.g. an end
 * date before its start, or a 120% percentage).
 */
export class UpdateOfferDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'DIWALI20' })
  @IsString()
  @Matches(COUPON_CODE_PATTERN, {
    message:
      'Code must be 3–32 characters: letters, digits, hyphen or underscore (no spaces). It is stored upper-cased.',
  })
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ enum: DISCOUNT_TYPES })
  @IsIn(DISCOUNT_TYPES)
  @IsOptional()
  type?: DiscountType;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  value?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  minCartValue?: number;

  @ApiPropertyOptional({ minimum: 1, description: 'Send null to remove the cap' })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxDiscount?: number | null;

  @ApiPropertyOptional()
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  startsAt?: Date;

  @ApiPropertyOptional()
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  endsAt?: Date;

  @ApiPropertyOptional({ minimum: 1, description: 'Send null for unlimited' })
  @IsInt()
  @Min(1)
  @IsOptional()
  totalUsageLimit?: number | null;

  @ApiPropertyOptional({ minimum: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  perCustomerLimit?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsMongoId(ID_LIST)
  @IsOptional()
  applicableProductIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsMongoId(ID_LIST)
  @IsOptional()
  applicableCategoryIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsMongoId(ID_LIST)
  @IsOptional()
  excludedProductIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsMongoId(ID_LIST)
  @IsOptional()
  excludedCategoryIds?: string[];

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  customerVisible?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/** Switch an offer on or off without touching the rest of its configuration. */
export class UpdateOfferStatusDto {
  @ApiProperty({ description: 'Offers are switched, never silently deleted' })
  @IsBoolean()
  isActive!: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}

/** Checkout preview payload — quantities only, never prices or amounts. */
export class ValidateCouponLineDto {
  @ApiProperty()
  @IsMongoId()
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 999 })
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;
}

export class ValidateCouponDto {
  @ApiProperty({ example: 'DIWALI20' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;

  @ApiProperty({ type: [ValidateCouponLineDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @Type(() => ValidateCouponLineDto)
  items!: ValidateCouponLineDto[];
}
