// src/modules/cart/dto/cart.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

export class AddCartItemDto {
  @ApiProperty({ description: 'Product to add' })
  @IsMongoId()
  productId!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 99, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  @IsOptional()
  quantity: number = 1;
}

/** `0` is not an error — it means "remove this line". */
export class UpdateCartItemDto {
  @ApiProperty({ minimum: 0, maximum: 99 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  quantity!: number;
}

export class ApplyCartCouponDto {
  @ApiProperty({ example: 'WELCOME10', maxLength: 40 })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,40}$/, { message: 'Enter a valid coupon code' })
  @MaxLength(40)
  code!: string;
}

/**
 * Merging a guest cart on sign-in.
 *
 * The raw token, not the `guest:` key: the server owns the prefix, and accepting a
 * prefixed value would let a caller name an account cart.
 */
export class MergeGuestCartDto {
  @ApiProperty({
    description: 'The guest cart token this browser was using before signing in',
    minLength: 24,
    maxLength: 64,
  })
  @IsString()
  @MinLength(24)
  @MaxLength(64)
  guestCartId!: string;
}
