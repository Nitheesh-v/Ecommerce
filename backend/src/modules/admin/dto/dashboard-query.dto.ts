import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional } from 'class-validator';

export const DASHBOARD_RANGES = ['today', '7d', '30d', '90d', 'custom'] as const;

export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

/**
 * Date filter for dashboard analytics.
 *
 * `custom` requires both `from` and `to`; the service rejects a partial or
 * inverted range with a 400 instead of silently guessing.
 */
export class DashboardQueryDto {
  @ApiPropertyOptional({
    enum: DASHBOARD_RANGES,
    default: '30d',
    description: 'Preset range; use `custom` together with from/to',
  })
  @IsIn(DASHBOARD_RANGES)
  @IsOptional()
  range: DashboardRange = '30d';

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z', description: 'ISO date (custom only)' })
  @IsISO8601()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59.999Z', description: 'ISO date (custom only)' })
  @IsISO8601()
  @IsOptional()
  to?: string;
}
