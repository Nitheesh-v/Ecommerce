import { Module } from '@nestjs/common';
import { AppModule } from '../../src/app.module.js';
import { AdminProbeController } from './admin-probe.controller.js';
import { PaginationProbeController } from './pagination-probe.controller.js';

/**
 * The real application plus a probe route, so e2e tests exercise the actual
 * global pipe/guard/filter/interceptor registrations instead of re-declaring
 * them (which would let the tests drift from production behaviour).
 */
@Module({
  imports: [AppModule],
  controllers: [PaginationProbeController, AdminProbeController],
})
export class HardeningTestModule {}
