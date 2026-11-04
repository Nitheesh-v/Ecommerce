import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { COURIER_PROVIDERS } from '../courier/courier-provider.js';
import type { CourierProviderId } from '../courier/courier-provider.js';

export class ShipmentDimensionsDto {
  @ApiProperty({ minimum: 1, maximum: 300, description: 'Centimetres' })
  @IsInt()
  @Min(1)
  @Max(300)
  lengthCm!: number;

  @ApiProperty({ minimum: 1, maximum: 300, description: 'Centimetres' })
  @IsInt()
  @Min(1)
  @Max(300)
  widthCm!: number;

  @ApiProperty({ minimum: 1, maximum: 300, description: 'Centimetres' })
  @IsInt()
  @Min(1)
  @Max(300)
  heightCm!: number;
}

/**
 * Creates a shipment for an existing order.
 *
 * The address is **not** accepted here: it is copied from the order's immutable
 * snapshot, so a shipping form can never redirect a parcel to a different place.
 * Status is not accepted either — a new shipment always starts `pending` and moves
 * through the validated state machine.
 */
export class CreateShipmentDto {
  @ApiProperty({ description: 'Order to ship (must be confirmed or processing)' })
  @IsMongoId()
  orderId!: string;

  @ApiPropertyOptional({
    enum: COURIER_PROVIDERS,
    default: 'manual',
    description: 'Integration id; `manual` needs no credentials',
  })
  @IsIn(COURIER_PROVIDERS)
  @IsOptional()
  courierProvider: CourierProviderId = 'manual';

  @ApiPropertyOptional({ description: 'Printed partner name (defaults to the provider name)' })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  courierName?: string;

  @ApiPropertyOptional({ description: 'Tracking number / AWB' })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  trackingNumber?: string;

  @ApiPropertyOptional({ description: 'Tracking page supplied by the courier' })
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  @IsOptional()
  trackingUrl?: string;

  @ApiProperty({ minimum: 0, description: 'Delivery cost, in paise' })
  @IsInt()
  @Min(0)
  shippingCost!: number;

  @ApiPropertyOptional({ minimum: 1, description: 'Package weight, in grams' })
  @IsInt()
  @Min(1)
  @Max(100_000)
  @IsOptional()
  weightGrams?: number;

  @ApiPropertyOptional({ type: ShipmentDimensionsDto })
  @ValidateNested()
  @Type(() => ShipmentDimensionsDto)
  @IsOptional()
  dimensions?: ShipmentDimensionsDto;

  @ApiPropertyOptional({ description: 'Promised delivery date' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  estimatedDelivery?: Date;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Internal note (never shown to customers)' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}
