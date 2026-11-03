import { randomUUID } from 'node:crypto';
import type {
  CreateSessionInput,
  SessionRecord,
  SessionsRepository,
} from '../../src/modules/auth/repositories/sessions.repository.js';

/**
 * In-memory stand-in for the Mongoose sessions repository.
 *
 * `markRevoked` reproduces the conditional update used in MongoDB
 * (`findOneAndUpdate({ _id, revokedAt: null })`), which is the guarantee that
 * makes token rotation race-safe.
 */
export class InMemorySessionsRepository implements SessionsRepository {
  private readonly sessions = new Map<string, SessionRecord>();

  async create(input: CreateSessionInput): Promise<SessionRecord> {
    const record: SessionRecord = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      replacedByTokenHash: null,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      createdAt: new Date(),
    };

    this.sessions.set(record.id, record);

    return record;
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return (
      [...this.sessions.values()].find((session) => session.tokenHash === tokenHash) ??
      null
    );
  }

  async markRevoked(
    id: string,
    replacedByTokenHash: string | null = null,
  ): Promise<boolean> {
    const session = this.sessions.get(id);

    if (!session || session.revokedAt) {
      return false;
    }

    this.sessions.set(id, {
      ...session,
      revokedAt: new Date(),
      replacedByTokenHash,
    });

    return true;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    let revoked = 0;

    for (const [id, session] of this.sessions) {
      if (session.userId === userId && !session.revokedAt) {
        this.sessions.set(id, { ...session, revokedAt: new Date() });
        revoked += 1;
      }
    }

    return revoked;
  }

  countActive(userId: string): number {
    return [...this.sessions.values()].filter(
      (session) => session.userId === userId && !session.revokedAt,
    ).length;
  }
}
