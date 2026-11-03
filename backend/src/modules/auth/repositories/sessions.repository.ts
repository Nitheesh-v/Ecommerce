export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenHash: string | null;
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
}

export interface CreateSessionInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Persistence boundary for refresh sessions.
 *
 * `markRevoked` must be **atomic**: it returns `false` when the session was
 * already revoked by a concurrent request. That single guarantee is what makes
 * refresh-token rotation race-safe and reuse detectable.
 */
export abstract class SessionsRepository {
  abstract create(input: CreateSessionInput): Promise<SessionRecord>;

  abstract findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;

  /** Returns `true` only for the caller that actually revoked the session. */
  abstract markRevoked(
    id: string,
    replacedByTokenHash?: string | null,
  ): Promise<boolean>;

  abstract revokeAllForUser(userId: string): Promise<number>;
}
