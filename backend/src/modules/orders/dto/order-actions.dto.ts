import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
import { ORDER_STATUSES } from '../schemas/order.schema.js';
import type { OrderStatus } from '../schemas/order.schema.js';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ORDER_STATUSES, description: 'Target status' })
  @IsIn(ORDER_STATUSES)
  status!: OrderStatus;

  @ApiPropertyOptional({ description: 'Why the status changed', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'Internal note stored on the history entry', maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  note?: string;
}

export class CancelOrderDto {
  @ApiProperty({ description: 'Cancellation reason (shown to the customer)', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  note?: string;
}

/**
 * Shipping update.
 *
 * No carrier integration is invented: provider is a free label backed by the
 * `shipping.provider` value and a tracking URL, so any carrier (or a future
 * Shiprocket/Delhivery adapter) can be plugged in without changing the schema.
 */
export class UpdateShippingDto {
  @ApiPropertyOptional({ example: 'Delhivery', maxLength: 60 })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  provider?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  trackingNumber?: string;

  @ApiPropertyOptional({ description: 'Carrier tracking page', maxLength: 500 })
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  @IsOptional()
  trackingUrl?: string;

  @ApiPropertyOptional({ description: 'ISO date the parcel left the warehouse' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  shippedAt?: Date;

  @ApiPropertyOptional({ description: 'ISO date the parcel is expected' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  estimatedDelivery?: Date;

  @ApiPropertyOptional({ description: 'Appends a fulfilment note', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;
}

export class UpdatePaymentDto {
  @ApiProperty({
    enum: ['paid', 'failed'],
    description:
      'Recorded manually (bank transfer / COD collection). A client-side "payment succeeded" is never accepted as proof.',
  })
  @IsIn(['paid', 'failed'])
  status!: 'paid' | 'failed';

  @ApiPropertyOptional({ description: 'Bank / gateway transaction reference', maxLength: 120 })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  transactionId?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;
}

export class CreateRefundDto {
  @ApiProperty({ minimum: 1, description: 'Amount to refund, minor units' })
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class UpdateRefundDto {
  @ApiProperty({ enum: ['processed', 'failed'] })
  @IsIn(['processed', 'failed'])
  status!: 'processed' | 'failed';

  @ApiPropertyOptional({ description: 'Gateway refund id / UTR once money actually moved' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;
}

export class ReturnItemDto {
  @ApiProperty()
  @IsMongoId()
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 999 })
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;
}

export class RequestReturnDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  note?: string;

  @ApiProperty({ type: [ReturnItemDto], description: 'Lines being returned' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];
}

/**
 * Return workflow step.
 *
 * Stock is restored **only** by `inspect` with `restockApproved: true`, and only
 * once per return line — approval alone never puts goods back on the shelf.
 */
export class UpdateReturnDto {
  @ApiProperty({ enum: ['approve', 'reject', 'receive', 'inspect', 'complete'] })
  @IsIn(['approve', 'reject', 'receive', 'inspect', 'complete'])
  action!: 'approve' | 'reject' | 'receive' | 'inspect' | 'complete';

  @ApiPropertyOptional({ description: 'Decision / step note', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({ description: 'Inspection findings', maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  inspectionNotes?: string;

  @ApiPropertyOptional({
    description: 'Set with `inspect` — goods are saleable and may be restocked',
  })
  @IsBoolean()
  @IsOptional()
  restockApproved?: boolean;
}
