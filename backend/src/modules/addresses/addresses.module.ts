// src/modules/addresses/addresses.module.ts

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActiveAccountGuard } from '../auth/guards/active-account.guard.js';
import { UsersModule } from '../users/users.module.js';
import { AddressesController } from './addresses.controller.js';
import { AddressesService } from './addresses.service.js';
import { AddressesRepository } from './repositories/addresses.repository.js';
import { MongooseAddressesRepository } from './repositories/mongoose-addresses.repository.js';
import { Address, AddressSchema } from './schemas/address.schema.js';

/**
 * Saved addresses. Exported because checkout needs `requireOwned()`.
 *
 * `UsersModule` is imported for `ActiveAccountGuard`, which refuses suspended
 * accounts on an address book that is otherwise a plain per-user CRUD.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Address.name, schema: AddressSchema }]),
    UsersModule,
  ],
  controllers: [AddressesController],
  providers: [
    AddressesService,
    ActiveAccountGuard,
    { provide: AddressesRepository, useClass: MongooseAddressesRepository },
  ],
  exports: [AddressesService],
})
export class AddressesModule {}
