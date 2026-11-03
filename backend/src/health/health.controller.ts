import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { SkipResponseEnvelope } from '../common/decorators/skip-response-envelope.decorator.js';
import { PassthroughHttpException } from '../common/exceptions/passthrough-http.exception.js';
import { HealthService } from './health.service.js';
import type { LivenessResult, ReadinessResult } from './health.service.js';

/**
 * Infrastructure endpoints.
 *
 * Exempt from rate limiting (probes poll every few seconds) and from the
 * response envelope (monitoring expects a flat body).
 */
@ApiTags('health')
@SkipThrottle()
@SkipResponseEnvelope()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness probe. Never touches the database, so it stays fast and is safe
   * to poll from a container orchestrator or uptime monitor.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness — is the API process up?' })
  @ApiOkResponse({ description: 'The API process is running.' })
  check(): LivenessResult {
    return this.healthService.getLiveness();
  }

  /**
   * Readiness probe. Returns 200 only when every dependency a request needs is
   * available; 503 with the failing check otherwise.
   */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness — can this instance serve traffic?' })
  @ApiOkResponse({ description: 'All dependencies are available.' })
  ready(): ReadinessResult {
    const result = this.healthService.getReadiness();

    if (!result.success) {
      // Flat payload on purpose: monitoring tools read the body directly.
      throw new PassthroughHttpException(
        { ...result },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return result;
  }
}
