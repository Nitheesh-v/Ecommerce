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
import { ORDER_SORT_FIELDS, type OrderSortField } from '../repositories/orders.repository.js';
import {
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from '../schemas/order.schema.js';
import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../schemas/order.schema.js';

/**
 * Query for the admin order list.
 *
 * `search` matches order number, customer name or customer email — the three
 * things an operator actually types.
 */
export class OrdersQueryDto {
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

  @ApiPropertyOptional({ description: 'Order number, customer name or email' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsIn(ORDER_STATUSES)
  @IsOptional()
  status?: OrderStatus;

  @ApiPropertyOptional({ enum: PAYMENT_STATUSES })
  @IsIn(PAYMENT_STATUSES)
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ description: 'ISO date — orders placed on/after this instant' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  from?: Date;

  @ApiPropertyOptional({ description: 'ISO date — orders placed on/before this instant' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  to?: Date;

  @ApiPropertyOptional({ enum: ORDER_SORT_FIELDS, default: 'createdAt' })
  @IsIn(ORDER_SORT_FIELDS)
  @IsOptional()
  sortBy: OrderSortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: 'asc' | 'desc' = 'desc';
}
