import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardRepository } from './repositories/dashboard.repository.js';
import { MongoDashboardRepository } from './repositories/mongo-dashboard.repository.js';

@Module({
  controllers: [AdminController],
  providers: [
    DashboardService,
    // Analytics reads through the driver, but stays behind the same repository
    // contract as the rest of the project so it is testable without a database.
    { provide: DashboardRepository, useClass: MongoDashboardRepository },
  ],
})
export class AdminModule {}
