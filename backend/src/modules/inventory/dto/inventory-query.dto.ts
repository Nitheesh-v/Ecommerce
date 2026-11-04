import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  STOCK_SORT_FIELDS,
  type StockSortField,
  type StockStatus,
} from '../repositories/inventory.repository.js';

export const STOCK_STATUS_FILTERS = ['in', 'low', 'out'] as const satisfies readonly StockStatus[];

/**
 * Query for the admin inventory table.
 *
 * `stockStatus` is a *derived* value (out = 0, low = 0 < qty ≤ threshold,
 * in = qty > threshold) computed by the repository, so the filter always agrees
 * with the badge rendered in the table.
 */
export class InventoryQueryDto {
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

  @ApiPropertyOptional({ description: 'Matches product name or SKU' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by category id' })
  @IsMongoId()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ enum: STOCK_STATUS_FILTERS })
  @IsIn(STOCK_STATUS_FILTERS)
  @IsOptional()
  stockStatus?: StockStatus;

  @ApiPropertyOptional({ enum: STOCK_SORT_FIELDS, default: 'quantity' })
  @IsIn(STOCK_SORT_FIELDS)
  @IsOptional()
  sortBy: StockSortField = 'quantity';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: 'asc' | 'desc' = 'asc';
}

/** Query for the movement (audit trail) listing. */
export class MovementsQueryDto {
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

  @ApiPropertyOptional({ description: 'Only movements of this product' })
  @IsMongoId()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({ description: 'Matches product name, SKU or reference id' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    enum: ['initial', 'adjustment', 'order', 'cancellation', 'return', 'correction'],
  })
  @IsIn(['initial', 'adjustment', 'order', 'cancellation', 'return', 'correction'])
  @IsOptional()
  type?: 'initial' | 'adjustment' | 'order' | 'cancellation' | 'return' | 'correction';

  @ApiPropertyOptional({ description: 'ISO date — movements on/after this instant' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  from?: Date;

  @ApiPropertyOptional({ description: 'ISO date — movements on/before this instant' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  to?: Date;
}
