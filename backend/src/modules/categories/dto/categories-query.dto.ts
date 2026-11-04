import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CATEGORY_STATUSES } from '../schemas/category.schema.js';
import type { CategoryStatus } from '../schemas/category.schema.js';

export const CATEGORY_SORT_FIELDS = [
  'name',
  'displayOrder',
  'createdAt',
] as const;
export type CategorySortField = (typeof CATEGORY_SORT_FIELDS)[number];

/**
 * Query for the admin listing.
 *
 * `parentId=root` selects top-level categories; `parentId=<ObjectId>` selects the
 * children of that category. Validation is explicit (no silent coercion), so a
 * bad value is a 400 rather than a surprising empty page.
 */
export class AdminCategoriesQueryDto {
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
  @IsOptional()
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Matches name or slug' })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: CATEGORY_STATUSES })
  @IsIn(CATEGORY_STATUSES)
  @IsOptional()
  status?: CategoryStatus;

  @ApiPropertyOptional({
    description: "A category id (its children), 'root' (top level) or omitted (all)",
  })
  @IsString()
  @MaxLength(40)
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({ enum: CATEGORY_SORT_FIELDS, default: 'displayOrder' })
  @IsIn(CATEGORY_SORT_FIELDS)
  @IsOptional()
  sortBy: CategorySortField = 'displayOrder';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: 'asc' | 'desc' = 'asc';
}

/**
 * Storefront query.
 *
 * `tree=true` returns roots with their (active) children nested; without it the
 * response is a flat, ordered list. Inactive categories are never returned.
 */
export class PublicCategoriesQueryDto {
  @ApiPropertyOptional({ description: 'Nest children under their parent' })
  @IsBooleanString()
  @IsOptional()
  tree?: string;

  @ApiPropertyOptional({ description: 'Only the children of this category slug' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  parent?: string;
}
