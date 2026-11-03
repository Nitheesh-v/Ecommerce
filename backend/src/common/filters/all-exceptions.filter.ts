import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { ValidatedEnv } from '../../config/env.validation.js';
import type { ApiErrorBody } from '../dto/api-response.dto.js';
import { PassthroughHttpException } from '../exceptions/passthrough-http.exception.js';
import type { RequestWithContext } from '../interfaces/request-with-context.interface.js';

/** Minimal shape of the Mongoose errors we translate into HTTP responses. */
interface MongoError {
  code?: number;
  keyPattern?: Record<string, unknown>;
  name?: string;
  message?: string;
}

/**
 * The single error path of the API.
 *
 * Guarantees:
 * - one response shape for every business error (`ApiErrorBody`);
 * - validation errors become `400` with a `details` array;
 * - duplicate keys become `409`, malformed ObjectIds become `400`;
 * - unexpected errors become `500` **without** leaking stack traces or driver
 *   messages in production (they are logged server-side with the request id);
 * - `PassthroughHttpException` bodies are sent as-is (health probes).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly configService: ConfigService<ValidatedEnv, true>) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithContext>();
    const response = context.getResponse<Response>();

    // A handler already started writing (streaming/SSE) — nothing safe to add.
    if (response.headersSent) {
      this.logger.warn(
        `Exception after response started: ${describe(exception)} requestId=${request.requestId ?? '-'}`,
      );

      return;
    }

    const requestId = request.requestId;

    if (exception instanceof PassthroughHttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());

      return;
    }

    const isProduction =
      this.configService.get('NODE_ENV', { infer: true }) === 'production';
    const resolved = this.resolve(exception, isProduction);

    const body: ApiErrorBody = {
      success: false,
      statusCode: resolved.status,
      error: resolved.error,
      message: resolved.message,
      ...(resolved.details ? { details: resolved.details } : {}),
      path: request.originalUrl ?? request.url ?? '',
      method: request.method ?? '',
      timestamp: new Date().toISOString(),
      ...(requestId ? { requestId } : {}),
    };

    const logMessage = `${body.method} ${body.path} ${body.statusCode} ${body.message} requestId=${requestId ?? '-'}`;

    if (resolved.status >= 500) {
      // Stack traces belong in logs, never in responses.
      this.logger.error(logMessage, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(logMessage);
    }

    response.status(body.statusCode).json(body);
  }

  private resolve(
    exception: unknown,
    isProduction: boolean,
  ): {
    status: number;
    error: string;
    message: string;
    details?: string[];
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { status, error: reasonPhrase(status), message: payload };
      }

      const record = payload as Record<string, unknown>;
      const message = record.message;
      const errorField =
        typeof record.error === 'string' ? record.error : reasonPhrase(status);

      if (Array.isArray(message)) {
        return {
          status,
          error: errorField,
          message: 'Validation failed',
          details: message.map((item) => String(item)),
        };
      }

      if (typeof message === 'string') {
        return { status, error: errorField, message };
      }

      return { status, error: errorField, message: reasonPhrase(status) };
    }

    const mongoError = exception as MongoError;

    // Unique index violation.
    if (mongoError?.code === 11000) {
      const fields = mongoError.keyPattern ? Object.keys(mongoError.keyPattern) : [];

      return {
        status: HttpStatus.CONFLICT,
        error: reasonPhrase(HttpStatus.CONFLICT),
        message: 'A record with these values already exists',
        ...(fields.length > 0 ? { details: fields.map((field) => `${field} must be unique`) } : {}),
      };
    }

    // Malformed ObjectId cast.
    if (mongoError?.name === 'CastError') {
      return {
        status: HttpStatus.BAD_REQUEST,
        error: reasonPhrase(HttpStatus.BAD_REQUEST),
        message: 'Invalid identifier format',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: reasonPhrase(HttpStatus.INTERNAL_SERVER_ERROR),
      message:
        isProduction || !(exception instanceof Error)
          ? 'Internal server error'
          : exception.message,
    };
  }
}

function describe(exception: unknown): string {
  return exception instanceof Error ? `${exception.name}: ${exception.message}` : String(exception);
}

function reasonPhrase(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'Bad Request';
    case HttpStatus.UNAUTHORIZED:
      return 'Unauthorized';
    case HttpStatus.FORBIDDEN:
      return 'Forbidden';
    case HttpStatus.NOT_FOUND:
      return 'Not Found';
    case HttpStatus.CONFLICT:
      return 'Conflict';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'Too Many Requests';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'Unprocessable Entity';
    case HttpStatus.INTERNAL_SERVER_ERROR:
      return 'Internal Server Error';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'Service Unavailable';
    default:
      return 'Error';
  }
}
