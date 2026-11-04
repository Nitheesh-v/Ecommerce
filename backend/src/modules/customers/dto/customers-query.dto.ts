import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CUSTOMER_STATUSES } from '../../users/customer-status.js';
import type { CustomerStatus } from '../../users/customer-status.js';
import type { CustomerSortField } from '../repositories/customers.repository.js';

export const CUSTOMER_SORT_FIELDS: CustomerSortField[] = [
  'createdAt',
  'netSpent',
  'name',
];

/**
 * Query for the admin customer list.
 *
 * `search` matches name, email or phone — the three things an operator types.
 * Spending bounds are in **minor units (paise)**, like every amount in the API.
 */
export class CustomersQueryDto {
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

  @ApiPropertyOptional({ description: 'Name, email or phone' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_STATUSES })
  @IsIn(CUSTOMER_STATUSES)
  @IsOptional()
  status?: CustomerStatus;

  @ApiPropertyOptional({ description: 'ISO date — registered on/after this instant' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  from?: Date;

  @ApiPropertyOptional({ description: 'ISO date — registered on/before this instant' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  to?: Date;

  @ApiPropertyOptional({ minimum: 0, description: 'Minimum net spending, in paise' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  minSpent?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Maximum net spending, in paise' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  maxSpent?: number;

  @ApiPropertyOptional({ description: 'Only customers with at least one successful purchase' })
  @Transform(({ value }) => (value === true || value === 'true' ? true : false))
  @IsBoolean()
  @IsOptional()
  hasOrders?: boolean;

  @ApiPropertyOptional({ enum: CUSTOMER_SORT_FIELDS, default: 'createdAt' })
  @IsIn(CUSTOMER_SORT_FIELDS)
  @IsOptional()
  sortBy: CustomerSortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: 'asc' | 'desc' = 'desc';
}
