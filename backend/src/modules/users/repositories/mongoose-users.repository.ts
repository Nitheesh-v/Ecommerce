import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import type { Role } from '../../../common/enums/role.enum.js';
import { User } from '../schemas/user.schema.js';
import type { UserDocument } from '../schemas/user.schema.js';
import { resolveStatus } from '../customer-status.js';
import type { CustomerStatus } from '../customer-status.js';
import type {
  CreateUserInput,
  UpdateStatusInput,
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
        phone: input.phone,
        status: 'active',
        isActive: true,
        statusHistory: [],
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

  async updateStatus(
    id: string,
    expected: CustomerStatus,
    input: UpdateStatusInput,
  ): Promise<UserRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    // The status is part of the *filter*, so two admins acting on a stale screen
    // produce one change and one conflict — never a silent overwrite.
    const document = await this.userModel
      .findOneAndUpdate(
        { _id: id, status: expected },
        {
          $set: {
            status: input.status,
            // Keep the legacy boolean in lock-step with the richer status.
            isActive: input.status === 'active',
          },
          $push: { statusHistory: input.entry },
        },
        { new: true },
      )
      .select('+passwordHash')
      .exec();

    return document ? toRecord(document) : null;
  }

  async setPhoneIfMissing(id: string, phone: string): Promise<void> {
    if (!isValidObjectId(id) || !phone.trim()) {
      return;
    }

    await this.userModel
      .updateOne(
        { _id: id, $or: [{ phone: { $exists: false } }, { phone: null }, { phone: '' }] },
        { $set: { phone: phone.trim() } },
      )
      .exec();
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
    status: resolveStatus({ status: document.status, isActive: document.isActive }),
    phone: document.phone,
    avatarUrl: document.avatarUrl,
    statusHistory: (document.statusHistory ?? []).map((entry) => ({
      from: entry.from,
      to: entry.to,
      reason: entry.reason,
      note: entry.note,
      by: entry.by ?? null,
      at: entry.at,
    })),
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
