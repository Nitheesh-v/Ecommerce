// src/modules/checkout/dto/checkout.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * How the customer intends to pay.
 *
 * Two values, not six: at this point the customer is choosing *when* the money
 * moves — now or at the door. Which instrument (card, UPI, netbanking) is the
 * gateway's business, and `PaymentsService` records the real one when it captures.
 */
export const CHECKOUT_PAYMENT_METHODS = ['cod', 'online'] as const;
export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHODS)[number];

/**
 * A delivery address typed in by a guest.
 *
 * Identical field rules to the address book's `CreateAddressDto` and the order's
 * own shipping address, so an address accepted here is one the order can always
 * take. A guest has no saved book — this is the only way they can receive a parcel.
 */
export class GuestAddressDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(2)
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
  @MinLength(3)
  @MaxLength(200)
  line1!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  line2?: string;

  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MinLength(2)
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

export class CheckoutPreviewDto {
  @ApiPropertyOptional({
    description: "Saved address to deliver to (must be the caller's own)",
  })
  // A signed-in customer sends an address id; a guest sends a typed address instead.
  // Exactly one of the two is required, which the service enforces because it is the
  // only place that knows whether the caller has an account.
  @ValidateIf((dto: CheckoutPreviewDto) => dto.guestAddress === undefined)
  @IsMongoId()
  @IsOptional()
  addressId?: string;

  @ApiPropertyOptional({
    type: GuestAddressDto,
    description: 'Delivery address typed in by a guest (signed-in callers use addressId)',
  })
  @ValidateIf((dto: CheckoutPreviewDto) => dto.addressId === undefined)
  @ValidateNested()
  @Type(() => GuestAddressDto)
  @IsOptional()
  guestAddress?: GuestAddressDto;

  @ApiProperty({ enum: CHECKOUT_PAYMENT_METHODS, description: 'Pay now or on delivery' })
  @IsIn(CHECKOUT_PAYMENT_METHODS)
  paymentMethod!: CheckoutPaymentMethod;
}

/**
 * Placing the order.
 *
 * Still no money on the wire: the cart and the address are the only inputs, and
 * every amount is recomputed from the product records and settings.
 */
export class PlaceOrderDto extends CheckoutPreviewDto {
  @ApiPropertyOptional({
    description: 'Where the confirmation should go (guests only; defaults to the address email)',
    maxLength: 160,
  })
  @IsEmail()
  @IsOptional()
  guestEmail?: string;

  @ApiPropertyOptional({ description: 'Note for the packer / courier', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  customerNote?: string;

  @ApiPropertyOptional({
    description:
      'Client-generated key: a retried checkout returns the same order instead of creating a second one',
    maxLength: 120,
  })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  idempotencyKey?: string;
}
