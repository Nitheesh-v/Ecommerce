import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongooseUsersRepository } from './repositories/mongoose-users.repository.js';
import { UsersRepository } from './repositories/users.repository.js';
import { User, UserSchema } from './schemas/user.schema.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [
    UsersService,
    // Bind the abstract class to its Mongoose implementation; tests override it.
    { provide: UsersRepository, useClass: MongooseUsersRepository },
  ],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
