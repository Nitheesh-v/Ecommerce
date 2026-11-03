import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service.js';
import type { LivenessResult, ReadinessResult } from './health.service.js';

@ApiTags('health')
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
      throw new ServiceUnavailableException(result);
    }

    return result;
  }
}
