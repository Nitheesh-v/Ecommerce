import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { RequestWithContext } from '../interfaces/request-with-context.interface.js';

const REQUEST_ID_HEADER = 'x-request-id';
const MAX_INCOMING_LENGTH = 128;

/**
 * Assigns a correlation id to every request and echoes it back.
 *
 * An inbound `x-request-id` is reused when it looks sane (so a caller or proxy
 * can correlate logs); otherwise a UUID is generated. The id is attached to the
 * request for the logger and the exception filter.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithContext, res: Response, next: NextFunction): void {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof incoming === 'string' &&
      incoming.length > 0 &&
      incoming.length <= MAX_INCOMING_LENGTH
        ? incoming
        : randomUUID();

    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    next();
  }
}
