import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { CreateCategoryDto } from './create-category.dto.js';
import {
  CATEGORY_STATUSES,
  type CategoryStatus,
} from '../schemas/category.schema.js';

/**
 * Every field optional, all validators preserved (including the nested image
 * shape). Cross-field rules — parent existence, self-parent, cycles, depth,
 * sibling-name uniqueness, slug uniqueness — are enforced in `CategoriesService`
 * because they need the stored record, not just the payload.
 */
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class UpdateCategoryStatusDto {
  @ApiProperty({ enum: CATEGORY_STATUSES })
  @IsIn(CATEGORY_STATUSES)
  status!: CategoryStatus;
}
