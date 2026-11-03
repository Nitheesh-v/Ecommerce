import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Session } from '../schemas/session.schema.js';
import type { SessionDocument } from '../schemas/session.schema.js';
import type {
  CreateSessionInput,
  SessionRecord,
  SessionsRepository,
} from './sessions.repository.js';

@Injectable()
export class MongooseSessionsRepository implements SessionsRepository {
  constructor(
    @InjectModel(Session.name) private readonly sessionModel: Model<Session>,
  ) {}

  async create(input: CreateSessionInput): Promise<SessionRecord> {
    const document = await this.sessionModel.create({
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      revokedAt: null,
      replacedByTokenHash: null,
    });

    return toRecord(document);
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const document = await this.sessionModel.findOne({ tokenHash }).exec();

    return document ? toRecord(document) : null;
  }

  async markRevoked(
    id: string,
    replacedByTokenHash: string | null = null,
  ): Promise<boolean> {
    // Conditional update: only the first caller sees `revokedAt: null`.
    const updated = await this.sessionModel
      .findOneAndUpdate(
        { _id: id, revokedAt: null },
        { $set: { revokedAt: new Date(), replacedByTokenHash } },
        { new: true },
      )
      .exec();

    return updated !== null;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.sessionModel
      .updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } })
      .exec();

    return result.modifiedCount ?? 0;
  }
}

function toRecord(document: SessionDocument): SessionRecord {
  return {
    id: String(document._id),
    userId: document.userId,
    tokenHash: document.tokenHash,
    expiresAt: document.expiresAt,
    revokedAt: document.revokedAt,
    replacedByTokenHash: document.replacedByTokenHash,
    userAgent: document.userAgent,
    ipAddress: document.ipAddress,
    createdAt: document.createdAt,
  };
}
