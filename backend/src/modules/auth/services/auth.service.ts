import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { PublicUser, UserRecord } from '../../users/repositories/users.repository.js';
import { UsersService } from '../../users/users.service.js';
import type { LoginDto } from '../dto/login.dto.js';
import type { RegisterDto } from '../dto/register.dto.js';
// Value import: the abstract class doubles as the DI token.
import { SessionsRepository } from '../repositories/sessions.repository.js';
import { TokenService } from './token.service.js';

export interface ClientMetadata {
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  /**
   * Returned so the controller can place it in an HttpOnly cookie. It must never
   * be written to the response body.
   */
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Authentication rules.
 *
 * Tokens: short-lived JWT access token (sent in `Authorization`) plus an opaque
 * refresh token in an HttpOnly cookie. Refresh tokens are rotated on every use
 * and stored only as hashes, so a stolen token is useful at most once — and
 * using it a second time revokes every session of that user.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly sessionsRepository: SessionsRepository,
  ) {}

  async register(input: RegisterDto, meta: ClientMetadata): Promise<AuthResult> {
    const user = await this.usersService.create(input);

    return this.issueSession(user, meta);
  }

  async login(input: LoginDto, meta: ClientMetadata): Promise<AuthResult> {
    const user = await this.usersService.verifyCredentials(input.email, input.password);

    return this.issueSession(user, meta);
  }

  /**
   * Rotates a refresh token.
   *
   * Order matters: the replacement token is generated first, then the current
   * session is revoked **atomically**. Only the request that wins that update may
   * continue; anyone replaying an already-rotated token fails here and has all
   * of their sessions revoked (assumed theft).
   */
  async refresh(rawToken: string | undefined, meta: ClientMetadata): Promise<AuthResult> {
    if (!rawToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const tokenHash = this.tokenService.hashRefreshToken(rawToken);
    const session = await this.sessionsRepository.findByTokenHash(tokenHash);

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.revokedAt) {
      await this.handleReuse(session.userId);

      throw new UnauthorizedException(
        'Refresh token reuse detected; all sessions have been revoked',
      );
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.sessionsRepository.markRevoked(session.id, null);

      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.usersService.findById(session.userId);

    if (!user) {
      await this.sessionsRepository.markRevoked(session.id, null);

      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!user.isActive) {
      await this.sessionsRepository.revokeAllForUser(user.id);

      throw new UnauthorizedException('This account has been disabled');
    }

    const replacement = this.tokenService.generateRefreshToken();
    const rotated = await this.sessionsRepository.markRevoked(
      session.id,
      replacement.tokenHash,
    );

    if (!rotated) {
      // Another request won the race (or this token was already used).
      await this.handleReuse(user.id);

      throw new UnauthorizedException(
        'Refresh token reuse detected; all sessions have been revoked',
      );
    }

    const expiresAt = this.tokenService.getRefreshExpiry();
    await this.sessionsRepository.create({
      userId: user.id,
      tokenHash: replacement.tokenHash,
      expiresAt,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    return {
      user: this.usersService.toPublicUser(user),
      accessToken: await this.tokenService.signAccessToken(user),
      refreshToken: replacement.token,
      refreshExpiresAt: expiresAt,
    };
  }

  /** Idempotent: logging out twice is not an error. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) {
      return;
    }

    const session = await this.sessionsRepository.findByTokenHash(
      this.tokenService.hashRefreshToken(rawToken),
    );

    if (session && !session.revokedAt) {
      await this.sessionsRepository.markRevoked(session.id, null);
    }
  }

  async logoutAll(userId: string): Promise<number> {
    return this.sessionsRepository.revokeAllForUser(userId);
  }

  async getCurrentUser(userId: string): Promise<PublicUser> {
    const user = await this.usersService.findById(userId);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('This account is no longer active');
    }

    return this.usersService.toPublicUser(user);
  }

  private async issueSession(user: UserRecord, meta: ClientMetadata): Promise<AuthResult> {
    const refresh = this.tokenService.generateRefreshToken();
    const expiresAt = this.tokenService.getRefreshExpiry();

    await this.sessionsRepository.create({
      userId: user.id,
      tokenHash: refresh.tokenHash,
      expiresAt,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    return {
      user: this.usersService.toPublicUser(user),
      accessToken: await this.tokenService.signAccessToken(user),
      refreshToken: refresh.token,
      refreshExpiresAt: expiresAt,
    };
  }

  private async handleReuse(userId: string): Promise<void> {
    const revoked = await this.sessionsRepository.revokeAllForUser(userId);
    this.logger.warn(
      `Refresh token reuse detected for user ${userId}; revoked ${revoked} session(s)`,
    );
  }
}
