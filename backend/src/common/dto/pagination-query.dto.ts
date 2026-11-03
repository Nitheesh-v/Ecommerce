import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export type SortOrder = 'asc' | 'desc';

/**
 * Reusable query DTO for every list endpoint.
 *
 * `@Type(() => Number)` is required because the global ValidationPipe runs with
 * `enableImplicitConversion: false`: query strings arrive as strings and must be
 * converted explicitly, otherwise `@IsInt()` always fails.
 *
 * Bound the page size (`limit <= 100`) so a client cannot ask the database for
 * everything at once.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1, description: '1-based page number' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20, description: 'Items per page' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Free-text search term', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Field to sort by', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  order: SortOrder = 'desc';
}
