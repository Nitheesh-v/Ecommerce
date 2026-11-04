import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminCustomersController } from './admin-customers.controller.js';
import { CustomersService } from './customers.service.js';
import { CustomersRepository } from './repositories/customers.repository.js';
import { MongoCustomersRepository } from './repositories/mongo-customers.repository.js';

/**
 * Customer management.
 *
 * Dependencies point one way: customers → users (account state), orders (history),
 * auth (session revocation). No module imports customers, so the graph stays
 * acyclic and the customer console can never become a hidden dependency of the
 * checkout path.
 *
 * There is no `customers` collection: the repository is a read model over `users`
 * joined with `orders`.
 */
@Module({
  imports: [UsersModule, OrdersModule, AuthModule],
  controllers: [AdminCustomersController],
  providers: [
    CustomersService,
    { provide: CustomersRepository, useClass: MongoCustomersRepository },
  ],
  exports: [CustomersService],
})
export class CustomersModule {}
