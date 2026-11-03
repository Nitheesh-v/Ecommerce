import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { SKIP_RESPONSE_ENVELOPE_KEY } from '../constants/metadata-keys.js';
import type { ApiSuccessBody } from '../dto/api-response.dto.js';
import type { PaginatedResult } from '../utils/pagination.util.js';

/**
 * Wraps every successful response in `{ success: true, data }`.
 *
 * A handler that returns `{ data, meta }` (see `createPaginatedResult`) has its
 * `meta` promoted to the top level, giving list endpoints a consistent shape:
 *
 * ```json
 * { "success": true, "data": [...], "meta": { "page": 1, "total": 42, ... } }
 * ```
 *
 * Endpoints decorated with `@SkipResponseEnvelope()` (health probes) bypass it.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessBody<T | T[]> | T
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessBody<T | T[]> | T> {
    const skipEnvelope = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_ENVELOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipEnvelope) {
      return next.handle();
    }

    return next.handle().pipe(
      map((payload) => {
        if (isPaginatedResult<T>(payload)) {
          return {
            success: true as const,
            data: payload.data,
            meta: payload.meta,
          };
        }

        return {
          success: true as const,
          data: payload === undefined ? (null as T) : payload,
        };
      }),
    );
  }
}

function isPaginatedResult<T>(payload: unknown): payload is PaginatedResult<T> {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'data' in payload &&
    'meta' in payload &&
    Array.isArray((payload as PaginatedResult<T>).data)
  );
}
