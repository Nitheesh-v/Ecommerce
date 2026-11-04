import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Starts (or resumes) a payment attempt for an order.
 *
 * The amount is **never** accepted from the client: it is read from the stored
 * order, so a tampered request cannot pay ₹1 for a ₹10,000 order.
 */
export class CreatePaymentOrderDto {
  @ApiProperty({ description: 'Order to pay for (must belong to the caller)' })
  @IsMongoId()
  orderId!: string;
}

/** The checkout callback, as the gateway widget reports it. */
export class VerifyPaymentDto {
  @ApiProperty({ description: 'Gateway order id (`order_…`)' })
  @IsString()
  @MinLength(4)
  @MaxLength(120)
  gatewayOrderId!: string;

  @ApiProperty({ description: 'Gateway payment id (`pay_…`)' })
  @IsString()
  @MinLength(4)
  @MaxLength(120)
  gatewayPaymentId!: string;

  @ApiProperty({ description: 'Signature produced by the gateway checkout' })
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  signature!: string;
}

/** Admin-initiated refund of a captured gateway payment. */
export class RefundPaymentDto {
  @ApiProperty({ description: 'Amount to refund, in paise', minimum: 1 })
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiProperty({ description: 'Why the money is going back (stored on the refund)' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ description: 'Internal note for the audit trail', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;
}
