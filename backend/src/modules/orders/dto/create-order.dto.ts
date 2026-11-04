import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PAYMENT_METHODS, SHIPPING_METHODS } from '../schemas/order.schema.js';
import type { PaymentMethod, ShippingMethod } from '../schemas/order.schema.js';

export class OrderItemInputDto {
  @ApiProperty({ description: 'Product being bought' })
  @IsMongoId()
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 999 })
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;
}

export class ShippingAddressDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  recipientName!: string;

  @ApiProperty({ example: '+91 98765 43210' })
  @IsString()
  @Matches(/^[\d+\-\s()]{6,20}$/, {
    message: 'Phone must contain 6–20 digits and phone symbols',
  })
  phone!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  line1!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  line2?: string;

  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  city!: string;

  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  state!: string;

  @ApiProperty({ example: '641001' })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9\s-]{2,15}$/, { message: 'Invalid postal code' })
  postalCode!: string;

  @ApiPropertyOptional({ default: 'India', maxLength: 80 })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  country?: string;
}

/**
 * Checkout payload.
 *
 * Note what is **not** here: prices, discounts, shipping charges and totals. The
 * client states what it wants and where it ships; every amount is computed on the
 * server from the product records (`OrdersService.createForCustomer`).
 */
export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];

  @ApiProperty({ type: ShippingAddressDto })
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress!: ShippingAddressDto;

  @ApiPropertyOptional({ enum: SHIPPING_METHODS, default: 'standard' })
  @IsIn(SHIPPING_METHODS)
  @IsOptional()
  shippingMethod?: ShippingMethod;

  @ApiProperty({ enum: PAYMENT_METHODS, description: 'Chosen payment method' })
  @IsIn(PAYMENT_METHODS)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Customer note shown on the order',
    maxLength: 500,
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  customerNote?: string;

  @ApiPropertyOptional({
    description:
      'Client-generated key making checkout retries return the same order instead of creating a second one',
    maxLength: 120,
  })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  idempotencyKey?: string;
}

/**
 * Admin-created order (phone order, manual entry, seed data).
 *
 * Identical to checkout but the customer is supplied explicitly, because no
 * account is necessarily involved.
 */
export class AdminCreateOrderDto extends CreateOrderDto {
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  customerName!: string;

  @ApiProperty()
  @IsEmail()
  @MaxLength(254)
  customerEmail!: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  customerPhone?: string;

  @ApiPropertyOptional({ description: 'Links the order to a customer account' })
  @IsMongoId()
  @IsOptional()
  userId?: string;
}
