import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CATEGORY_STATUSES,
  type CategoryStatus,
} from '../schemas/category.schema.js';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Image reference returned by `POST /api/admin/uploads/images`.
 * The bytes live on disk/Cloudinary; only this metadata is persisted.
 */
export class CategoryImageDto {
  @ApiProperty({ description: 'Absolute URL or API-relative path (/uploads/…)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  url!: string;

  @ApiPropertyOptional({ description: 'Provider handle (Cloudinary public_id)' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  publicId?: string;

  @ApiPropertyOptional({ description: 'Alt text for accessibility and SEO' })
  @IsString()
  @IsOptional()
  @MaxLength(160)
  alt?: string;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Men’s Clothing', minLength: 2, maxLength: 80 })
  @IsString()
  @IsNotEmpty({ message: 'Category name is required' })
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({
    description: 'Omit to generate from the name. Must be unique.',
    example: 'mens-clothing',
  })
  @IsString()
  @Matches(SLUG_PATTERN, {
    message:
      'slug must be lowercase letters, numbers and single hyphens (e.g. mens-clothing)',
  })
  @MaxLength(100)
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ type: CategoryImageDto })
  @ValidateNested()
  @Type(() => CategoryImageDto)
  @IsOptional()
  image?: CategoryImageDto;

  @ApiPropertyOptional({
    description: 'Parent category id. Omit or send null for a top-level category.',
    nullable: true,
  })
  @IsMongoId({ message: 'parentId must be a category id' })
  @IsOptional()
  parentId?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  @IsOptional()
  displayOrder?: number;

  @ApiPropertyOptional({ enum: CATEGORY_STATUSES, default: 'active' })
  @IsIn(CATEGORY_STATUSES)
  @IsOptional()
  status?: CategoryStatus;

  @ApiPropertyOptional({ maxLength: 70 })
  @IsString()
  @IsOptional()
  @MaxLength(70)
  seoTitle?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsString()
  @IsOptional()
  @MaxLength(160)
  seoDescription?: string;
}
