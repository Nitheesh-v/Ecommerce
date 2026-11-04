import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { COURIER_PROVIDERS } from '../courier/courier-provider.js';
import type { CourierProviderId } from '../courier/courier-provider.js';
import { SHIPMENT_STATUSES } from '../schemas/shipment.schema.js';
import type { ShipmentStatus } from '../schemas/shipment.schema.js';

/**
 * Status change.
 *
 * `reason` is required for the two outcomes a customer will ask about — a failed
 * delivery and a return to sender — and is stored verbatim in the history.
 */
export class UpdateShipmentStatusDto {
  @ApiProperty({ enum: SHIPMENT_STATUSES })
  @IsIn(SHIPMENT_STATUSES)
  status!: ShipmentStatus;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Why this happened (mandatory for delivery_failed / returned_to_sender)',
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ maxLength: 500, description: 'Internal note' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({ description: 'Actual delivery time (defaults to now)' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  actualDelivery?: Date;
}

/**
 * Courier assignment / correction.
 *
 * Refused once the parcel has been delivered or returned: the proof of delivery is
 * a historical fact, not something a later edit should rewrite.
 */
export class UpdateShipmentCourierDto {
  @ApiProperty({ enum: COURIER_PROVIDERS })
  @IsIn(COURIER_PROVIDERS)
  courierProvider!: CourierProviderId;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  courierName?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  trackingNumber?: string;

  @ApiPropertyOptional({ description: 'Tracking page (http/https)' })
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  @IsOptional()
  trackingUrl?: string;

  @ApiPropertyOptional({
    minLength: 3,
    maxLength: 500,
    description: 'Why the courier changed (stored in the history)',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}
