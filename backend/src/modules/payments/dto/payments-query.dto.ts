import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PAYMENT_METHODS } from '../../orders/schemas/order.schema.js';
import type { PaymentMethod } from '../../orders/schemas/order.schema.js';
import { PAYMENT_STATUSES } from '../schemas/payment.schema.js';
import type { PaymentStatus } from '../schemas/payment.schema.js';
import { PAYMENT_SORT_FIELDS } from '../repositories/payments.repository.js';
import type { PaymentSortField } from '../repositories/payments.repository.js';

/**
 * Query for the admin transaction table.
 *
 * `search` matches transaction id, gateway ids, order number, customer name and
 * email — the five things an operator actually pastes into a search box.
 */
export class AdminPaymentsQueryDto {
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

  @ApiPropertyOptional({ description: 'Transaction id, order id/number, customer name or email' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: PAYMENT_STATUSES })
  @IsIn(PAYMENT_STATUSES)
  @IsOptional()
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  @IsOptional()
  method?: PaymentMethod;

  @ApiPropertyOptional({ description: 'ISO date — created on/after this instant' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  from?: Date;

  @ApiPropertyOptional({ description: 'ISO date — created on/before this instant' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  to?: Date;

  @ApiPropertyOptional({ enum: PAYMENT_SORT_FIELDS, default: 'createdAt' })
  @IsIn(PAYMENT_SORT_FIELDS)
  @IsOptional()
  sortBy: PaymentSortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: 'asc' | 'desc' = 'desc';
}
