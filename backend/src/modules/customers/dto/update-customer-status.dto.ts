import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CUSTOMER_STATUSES } from '../../users/customer-status.js';
import type { CustomerStatus } from '../../users/customer-status.js';

/**
 * Admin account-status change.
 *
 * The transition itself is validated by the service (not the DTO) so the error is a
 * readable 400 naming the legal next states instead of a generic validation dump.
 */
export class UpdateCustomerStatusDto {
  @ApiProperty({ enum: CUSTOMER_STATUSES, example: 'suspended' })
  @IsIn(CUSTOMER_STATUSES)
  status!: CustomerStatus;

  @ApiPropertyOptional({ example: 'Repeated chargeback attempts', maxLength: 300 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
