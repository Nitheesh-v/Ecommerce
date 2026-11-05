import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schema.js';
import { AdminController } from './admin.controller.js';
import { AdminReportsController } from './admin-reports.controller.js';
import { DashboardService } from './dashboard.service.js';
import { ReportsService } from './reports.service.js';
import { CustomerInsightsRepository } from './repositories/customer-insights.repository.js';
import { DashboardRepository } from './repositories/dashboard.repository.js';
import { MongoCustomerInsightsRepository } from './repositories/mongo-customer-insights.repository.js';
import { MongoDashboardRepository } from './repositories/mongo-dashboard.repository.js';

/**
 * Admin console: dashboard and reports.
 *
 * Both read the same order data through repository contracts, so the e2e suite can
 * swap them for in-memory fixtures and the sales report can never disagree with the
 * dashboard about what revenue means.
 */
@Module({
  imports: [
    // Customer analytics groups orders; only the model is needed, not OrdersModule.
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
  ],
  controllers: [AdminController, AdminReportsController],
  providers: [
    DashboardService,
    ReportsService,
    // Analytics reads through the driver, but stays behind the same repository
    // contract as the rest of the project so it is testable without a database.
    { provide: DashboardRepository, useClass: MongoDashboardRepository },
    { provide: CustomerInsightsRepository, useClass: MongoCustomerInsightsRepository },
  ],
})
export class AdminModule {}
