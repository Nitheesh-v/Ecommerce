import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Role } from '../../common/enums/role.enum.js';
import {
  isAccountUsable,
  resolveStatus,
  unusableAccountMessage,
} from './customer-status.js';
import type { ValidatedEnv } from '../../config/env.validation.js';
// Value import: `UsersRepository` is an abstract class used as the DI token.
// A type-only import would leave `design:paramtypes` undefined at runtime.
import { UsersRepository } from './repositories/users.repository.js';
import type { CustomerStatus } from './customer-status.js';
import type {
  PublicUser,
  UpdateStatusInput,
  UserRecord,
} from './repositories/users.repository.js';

/**
 * Pre-computed hash used when the email does not exist.
 *
 * Comparing against it keeps the response time of "unknown email" and "wrong
 * password" similar, so an attacker cannot enumerate accounts by timing.
 */
const DUMMY_PASSWORD_HASH =
  '$2b$12$C6UzMDM.H6dfI/f/IKcEe.j8Zf5nJ0m1oQw7o1Rv3YbHh4m1VJ4Hy';

export interface CreateCustomerInput {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  phone?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly configService: ConfigService<ValidatedEnv, true>,
  ) {}

  async create(input: CreateCustomerInput, role: Role = Role.Customer): Promise<UserRecord> {
    const email = normalizeEmail(input.email);

    if (await this.usersRepository.existsByEmail(email)) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.hashPassword(input.password);
    const created = await this.usersRepository.create({
      email,
      passwordHash,
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim(),
      role,
      phone: input.phone?.trim() || undefined,
    });

    if (!created) {
      // Lost a race against a concurrent registration for the same email.
      throw new ConflictException('An account with this email already exists');
    }

    return created;
  }

  /**
   * Verifies credentials.
   *
   * Returns the user only when the password matches *and* the account is active.
   * A wrong password and an unknown email produce the same 401 — never reveal
   * which half was wrong.
   */
  async verifyCredentials(email: string, password: string): Promise<UserRecord> {
    const user = await this.usersRepository.findByEmail(normalizeEmail(email));

    if (!user) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        unusableAccountMessage(resolveStatus(user)),
      );
    }

    return user;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.usersRepository.findById(id);
  }

  /**
   * Blocks suspended/deactivated accounts on actions that require a usable
   * session (placing orders, account features).
   *
   * `JwtAuthGuard` is stateless by design, so an access token issued before a
   * suspension would otherwise stay valid until it expires. This check is opt-in
   * per controller (`ActiveAccountGuard`) rather than on every request.
   */
  async assertUsable(userId: string): Promise<void> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }

    const status = resolveStatus(user);

    if (!isAccountUsable(status)) {
      throw new ForbiddenException(unusableAccountMessage(status));
    }
  }

  /**
   * Guarded status write.
   *
   * Returns `null` when the account moved on since it was read (another admin got
   * there first) — the caller turns that into a conflict instead of overwriting a
   * newer decision.
   */
  async changeStatus(
    id: string,
    expected: CustomerStatus,
    input: UpdateStatusInput,
  ): Promise<UserRecord | null> {
    return this.usersRepository.updateStatus(id, expected, input);
  }

  /** Best-effort: learn the phone number a customer used at checkout. */
  async rememberPhone(userId: string, phone: string | undefined): Promise<void> {
    if (!phone?.trim()) {
      return;
    }

    await this.usersRepository.setPhoneIfMissing(userId, phone);
  }

  async hashPassword(password: string): Promise<string> {
    const rounds = this.configService.get('BCRYPT_ROUNDS', { infer: true });

    return bcrypt.hash(password, rounds);
  }

  /** Strips the password hash. Every controller response goes through this. */
  toPublicUser(user: UserRecord): PublicUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
