import { Controller, Get, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../src/common/dto/pagination-query.dto.js';

/**
 * Test-only controller.
 *
 * It exposes the global ValidationPipe, DTO conversion and the response
 * envelope through a real HTTP route, so the cross-cutting layer can be tested
 * before any business module exists.
 */
@Controller('probe')
export class PaginationProbeController {
  @Get()
  list(@Query() query: PaginationQueryDto) {
    return { query };
  }
}
