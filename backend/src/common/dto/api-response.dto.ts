import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PaginationMeta } from '../utils/pagination.util.js';

/** Success envelope produced by `ResponseInterceptor`. */
export interface ApiSuccessBody<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

/** Error envelope produced by `AllExceptionsFilter`. */
export interface ApiErrorBody {
  success: false;
  statusCode: number;
  error: string;
  message: string;
  details?: string[];
  path: string;
  method: string;
  timestamp: string;
  requestId?: string;
}

export class PaginationMetaDto implements PaginationMeta {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 137 })
  total!: number;

  @ApiProperty({ example: 7 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage!: boolean;
}

/** Documented in Swagger next to every business endpoint. */
export class ApiSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ description: 'Endpoint-specific payload' })
  data!: unknown;

  @ApiPropertyOptional({ type: PaginationMetaDto })
  meta?: PaginationMetaDto;
}

export class ApiErrorResponseDto implements Omit<ApiErrorBody, 'success'> {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiProperty({ example: 'Validation failed' })
  message!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['limit must not be greater than 100'],
  })
  details?: string[];

  @ApiProperty({ example: '/api/products' })
  path!: string;

  @ApiProperty({ example: 'GET' })
  method!: string;

  @ApiProperty({ example: '2026-11-03T10:40:00.000Z' })
  timestamp!: string;

  @ApiPropertyOptional({ example: '3f1c9b1e-5a7a-4b1f-9a3c-9f2b1d0e6c11' })
  requestId?: string;
}
