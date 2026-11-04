import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PRODUCT_STATUSES } from '../schemas/product.schema.js';
import type { ProductStatus } from '../schemas/product.schema.js';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/;

export class ProductImageDto {
  @ApiProperty({ description: 'Absolute URL or API-relative path (`/uploads/…`)' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  url!: string;

  @ApiPropertyOptional({ description: 'Storage provider id (Cloudinary public_id)' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  publicId?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(160)
  @IsOptional()
  alt?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Wireless Noise-Cancelling Headphones', maxLength: 140 })
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name!: string;

  @ApiPropertyOptional({
    description:
      'URL slug. Omit to derive from the name; a collision gets a numeric suffix.',
    example: 'wireless-noise-cancelling-headphones',
  })
  @IsString()
  @MaxLength(100)
  @Matches(SLUG_PATTERN, {
    message: 'slug may only contain lowercase letters, numbers and single hyphens',
  })
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  shortDescription?: string;

  @ApiProperty({ description: 'Full description (plain text or Markdown)', minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;

  @ApiProperty({ example: 'SKU-AU-1001', description: 'Unique stock keeping unit' })
  @IsString()
  @Matches(SKU_PATTERN, {
    message: 'sku must be 3–40 characters: letters, numbers, hyphen or underscore',
  })
  sku!: string;

  @ApiProperty({ description: 'ObjectId of an existing category' })
  @IsMongoId()
  categoryId!: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  brand?: string;

  @ApiProperty({ description: 'Regular price in minor units (paise)', minimum: 1 })
  @IsInt()
  @Min(1)
  price!: number;

  @ApiPropertyOptional({
    description: 'Sale price in minor units; must be lower than `price`',
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  salePrice?: number | null;

  @ApiPropertyOptional({
    description: 'Internal cost price in minor units — never returned by public APIs',
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  costPrice?: number | null;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  stock?: number;

  @ApiPropertyOptional({ default: 5, minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  lowStockThreshold?: number;

  @ApiPropertyOptional({ enum: PRODUCT_STATUSES, default: 'draft' })
  @IsIn(PRODUCT_STATUSES)
  @IsOptional()
  status?: ProductStatus;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @ApiPropertyOptional({ type: [ProductImageDto], maxItems: 8 })
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  @IsOptional()
  images?: ProductImageDto[];

  @ApiPropertyOptional({ maxLength: 70 })
  @IsString()
  @MaxLength(70)
  @IsOptional()
  seoTitle?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  @IsOptional()
  seoDescription?: string;
}

export class UpdateProductStatusDto {
  @ApiProperty({ enum: PRODUCT_STATUSES })
  @IsIn(PRODUCT_STATUSES)
  status!: ProductStatus;
}

const STOCK_STATUSES = ['in', 'low', 'out'] as const;
const ADMIN_SORT_FIELDS = ['name', 'price', 'stock', 'createdAt', 'updatedAt'] as const;

export class AdminProductsQueryDto {
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

  @ApiPropertyOptional({ description: 'Matches name, SKU or slug' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Category ObjectId' })
  @IsMongoId()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ enum: PRODUCT_STATUSES })
  @IsIn(PRODUCT_STATUSES)
  @IsOptional()
  status?: ProductStatus;

  @ApiPropertyOptional({
    enum: STOCK_STATUSES,
    description: 'in = buyable, low = at/below threshold, out = none left',
  })
  @IsIn(STOCK_STATUSES)
  @IsOptional()
  stockStatus?: (typeof STOCK_STATUSES)[number];

  @ApiPropertyOptional({ enum: ADMIN_SORT_FIELDS, default: 'createdAt' })
  @IsIn(ADMIN_SORT_FIELDS)
  @IsOptional()
  sortBy: (typeof ADMIN_SORT_FIELDS)[number] = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: 'asc' | 'desc' = 'desc';
}

const PUBLIC_SORT_FIELDS = ['name', 'price', 'createdAt'] as const;

export class PublicProductsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 60, default: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  @IsOptional()
  limit: number = 12;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Category slug' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Only featured products' })
  @IsOptional()
  featured?: boolean;

  @ApiPropertyOptional({ enum: PUBLIC_SORT_FIELDS, default: 'createdAt' })
  @IsIn(PUBLIC_SORT_FIELDS)
  @IsOptional()
  sortBy: (typeof PUBLIC_SORT_FIELDS)[number] = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: 'asc' | 'desc' = 'desc';
}
