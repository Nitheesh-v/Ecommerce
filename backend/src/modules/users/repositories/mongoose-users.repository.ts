import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import type { Role } from '../../../common/enums/role.enum.js';
import { User } from '../schemas/user.schema.js';
import type { UserDocument } from '../schemas/user.schema.js';
import type {
  CreateUserInput,
  UserRecord,
  UsersRepository,
} from './users.repository.js';

@Injectable()
export class MongooseUsersRepository implements UsersRepository {
  private readonly logger = new Logger(MongooseUsersRepository.name);

  constructor(@InjectModel(User.name) private readonly userModel: Model<User>) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const document = await this.userModel
      .findOne({ email: email.toLowerCase().trim() })
      .select('+passwordHash')
      .exec();

    return document ? toRecord(document) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    // Guard before querying: a malformed id would otherwise throw a CastError
    // that surfaces as a 400 for what is really "unknown user".
    if (!isValidObjectId(id)) {
      return null;
    }

    const document = await this.userModel.findById(id).select('+passwordHash').exec();

    return document ? toRecord(document) : null;
  }

  async create(input: CreateUserInput): Promise<UserRecord | null> {
    try {
      const created = await this.userModel.create({
        email: input.email.toLowerCase().trim(),
        passwordHash: input.passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
      });

      // Re-read so the record is complete (defaults applied) and the hash is present.
      return await this.findById(created.id);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return null;
      }

      throw error;
    }
  }

  async existsByEmail(email: string): Promise<boolean> {
    const result = await this.userModel
      .exists({ email: email.toLowerCase().trim() })
      .exec();

    return result !== null;
  }
}

function toRecord(document: UserDocument): UserRecord {
  return {
    id: String(document._id),
    email: document.email,
    passwordHash: document.passwordHash,
    firstName: document.firstName,
    lastName: document.lastName,
    role: document.role as Role,
    isActive: document.isActive,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}
