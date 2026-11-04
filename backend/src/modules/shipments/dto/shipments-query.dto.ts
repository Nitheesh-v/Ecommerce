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
import { COURIER_PROVIDERS } from '../courier/courier-provider.js';
import { SHIPMENT_SORT_FIELDS } from '../repositories/shipments.repository.js';
import type { ShipmentSortField } from '../repositories/shipments.repository.js';
import { SHIPMENT_STATUSES } from '../schemas/shipment.schema.js';
import type { ShipmentStatus } from '../schemas/shipment.schema.js';

/**
 * Query for the admin shipment table.
 *
 * `courier` accepts either the integration id (`manual`, `shiprocket`, …) or the
 * printed partner name, because both are what an operator sees on screen.
 */
export class ShipmentsQueryDto {
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

  @ApiPropertyOptional({
    description: 'Shipment id/number, order number, customer name/email or tracking number',
  })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: SHIPMENT_STATUSES })
  @IsIn(SHIPMENT_STATUSES)
  @IsOptional()
  status?: ShipmentStatus;

  @ApiPropertyOptional({
    description: 'Courier integration id or partner name',
    enum: COURIER_PROVIDERS,
  })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  courier?: string;

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

  @ApiPropertyOptional({ description: 'Only parcels past their promised date' })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  delayed?: boolean;

  @ApiPropertyOptional({ enum: SHIPMENT_SORT_FIELDS, default: 'createdAt' })
  @IsIn(SHIPMENT_SORT_FIELDS)
  @IsOptional()
  sortBy: ShipmentSortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: 'asc' | 'desc' = 'desc';
}

/** Query for the "orders that can be shipped" picker. */
export class EligibleOrdersQueryDto {
  @ApiPropertyOptional({ description: 'Order number, customer name or email' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit: number = 20;
}
