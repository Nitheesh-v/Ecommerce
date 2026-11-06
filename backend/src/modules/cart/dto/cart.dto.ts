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
