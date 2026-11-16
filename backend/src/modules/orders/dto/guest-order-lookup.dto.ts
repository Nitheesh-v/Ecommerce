import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches } from 'class-validator';

/**
 * Query for `GET /api/orders/guest` — the confirmation screen for a shopper who
 * checked out without an account.
 *
 * Both halves are required and must match the same order. This is deliberately a
 * two-part proof rather than an id: order ids are guessable enough to be worth
 * probing, and an order number on its own travels in emails and screenshots.
 */
export class GuestOrderLookupDto {
  @ApiProperty({ example: 'ORD-20260116-0007' })
  @IsString()
  @Matches(/^ORD-\d{8}-\d{4}$/, { message: 'orderNumber must look like ORD-YYYYMMDD-NNNN' })
  orderNumber!: string;

  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email!: string;
}
