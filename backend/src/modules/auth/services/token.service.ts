import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '../../../common/enums/role.enum.js';
import { parseDurationToMs } from '../../../common/utils/duration.util.js';
import type { ValidatedEnv } from '../../../config/env.validation.js';
import type { JwtPayload } from '../interfaces/jwt-payload.interface.js';

export interface RefreshTokenPair {
  /** The raw token — goes into the HttpOnly cookie and is never stored. */
  token: string;
  /** SHA-256 hex digest — the only form that reaches the database. */
  tokenHash: string;
}

/**
 * Signing and hashing.
 *
 * Access tokens are short-lived JWTs. Refresh tokens are **opaque random
 * strings**, not JWTs: they carry no claims, so nothing can be read from them,
 * and revocation is a database fact rather than a cryptographic one.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<ValidatedEnv, true>,
  ) {}

  signAccessToken(user: { id: string; email: string; role: Role }): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return this.jwtService.signAsync(payload);
  }

  verifyAccessToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync<JwtPayload>(token);
  }

  generateRefreshToken(): RefreshTokenPair {
    const token = randomBytes(48).toString('base64url');

    return { token, tokenHash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Absolute expiry for a new session, from `JWT_REFRESH_EXPIRES_IN`. */
  getRefreshExpiry(from: Date = new Date()): Date {
    const ttlMs = parseDurationToMs(
      this.configService.get('JWT_REFRESH_EXPIRES_IN', { infer: true }),
    );

    return new Date(from.getTime() + ttlMs);
  }

  /** Lifetime in seconds, for clients that want to show "session expires in". */
  getRefreshTtlSeconds(): number {
    const ttlMs = parseDurationToMs(
      this.configService.get('JWT_REFRESH_EXPIRES_IN', { infer: true }),
    );

    return Math.floor(ttlMs / 1_000);
  }
}
