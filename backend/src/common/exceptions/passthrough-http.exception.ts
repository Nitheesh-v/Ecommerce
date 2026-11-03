import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * An HTTP error whose body is sent verbatim, bypassing the standard error
 * envelope.
 *
 * Only infrastructure endpoints should use it — a readiness probe must return
 * its own flat payload, not `{ success: false, statusCode, ... }`. Business
 * errors must stay inside the envelope so clients can handle one shape.
 */
export class PassthroughHttpException extends HttpException {
  constructor(body: Record<string, unknown>, status: HttpStatus) {
    super(body, status);
  }
}
