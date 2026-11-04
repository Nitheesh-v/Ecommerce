import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ADJUSTMENT_REASONS } from '../schemas/inventory-movement.schema.js';
import type { AdjustmentReason } from '../schemas/inventory-movement.schema.js';

/**
 * How the admin wants to change the quantity.
 *
 * - `increase` → `stock += quantity`
 * - `decrease` → `stock -= quantity` (rejected when it would go negative)
 * - `set`      → `stock = quantity` ("set exact quantity" after a stock count)
 */
export const ADJUSTMENT_ACTIONS = ['increase', 'decrease', 'set'] as const;
export type AdjustmentAction = (typeof ADJUSTMENT_ACTIONS)[number];

/**
 * Body for `POST /api/admin/inventory/adjust`.
 *
 * The server never trusts a quantity it is *given as a result* — only the delta
 * or the counted value — and it re-reads the product inside the same atomic
 * operation that writes the new quantity.
 */
export class AdjustStockDto {
  @ApiProperty({ description: 'Product whose stock changes' })
  @IsMongoId()
  productId!: string;

  @ApiProperty({ enum: ADJUSTMENT_ACTIONS, description: 'increase | decrease | set' })
  @IsIn(ADJUSTMENT_ACTIONS)
  action!: AdjustmentAction;

  @ApiProperty({
    minimum: 0,
    maximum: 1_000_000,
    description:
      'Units to add/remove, or the new absolute quantity for `set`. Must be ≥ 1 for increase/decrease.',
  })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantity!: number;

  @ApiProperty({
    enum: ADJUSTMENT_REASONS,
    description: 'Why the stock changed — required for the audit trail',
  })
  @IsIn(ADJUSTMENT_REASONS)
  reason!: AdjustmentReason;

  @ApiPropertyOptional({ maxLength: 500, description: 'Optional free-text note' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    maxLength: 120,
    description:
      'External idempotency key (e.g. a stock-count import batch). Replaying the same key is a no-op.',
  })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  referenceId?: string;
}
