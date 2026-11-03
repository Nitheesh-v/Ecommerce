import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import type { RequestWithContext } from '../interfaces/request-with-context.interface.js';

/**
 * One structured line per request: method, path, status, duration, request id.
 *
 * Written for machine-friendly scanning (and easy to swap for pino/winston in
 * Phase 13 without touching handlers).
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      finalize(() => {
        const durationMs = Date.now() - startedAt;
        const statusCode = response.statusCode;
        const userId = request.user?.id ? ` user=${request.user.id}` : '';
        const requestId = request.requestId ?? '-';
        const message = `${request.method} ${request.originalUrl} ${statusCode} ${durationMs}ms requestId=${requestId}${userId}`;

        if (statusCode >= 500) {
          this.logger.error(message);
        } else if (statusCode >= 400) {
          this.logger.warn(message);
        } else {
          this.logger.log(message);
        }
      }),
    );
  }
}
