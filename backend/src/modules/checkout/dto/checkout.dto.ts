// src/modules/checkout/dto/checkout.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
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

export class CheckoutPreviewDto {
  @ApiProperty({ description: 'Saved address to deliver to (must be the caller’s own)' })
  @IsMongoId()
  addressId!: string;

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
