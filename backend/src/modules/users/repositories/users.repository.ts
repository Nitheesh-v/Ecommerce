import type { Role } from '../../../common/enums/role.enum.js';
import type { CustomerStatus } from '../customer-status.js';

/**
 * A user as the rest of the application sees it — a plain object, not a Mongoose
 * document. Services never depend on driver types, and tests can substitute an
 * in-memory implementation without a database.
 *
 * `passwordHash` is part of the record (auth needs it) but must never be returned
 * by a controller: use `UsersService.toPublicUser()`.
 */
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName?: string;
  role: Role;
  /** Derived mirror of `status === 'active'` — kept for existing auth checks. */
  isActive: boolean;
  status: CustomerStatus;
  phone?: string;
  avatarUrl?: string;
  statusHistory: StatusHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

/** One append-only account-status change. */
export interface StatusHistoryEntry {
  from: CustomerStatus;
  to: CustomerStatus;
  reason?: string;
  note?: string;
  by?: { userId: string; email: string } | null;
  at: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName?: string;
  role: Role;
  phone?: string;
}

/** Fields an admin may change on an account. Nothing else is writable. */
export interface UpdateStatusInput {
  status: CustomerStatus;
  entry: StatusHistoryEntry;
}

/** Narrow representation safe to send to clients. */
export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName?: string;
  role: Role;
  createdAt: Date;
}

/**
 * Persistence boundary for users.
 *
 * Declared as an abstract class so it doubles as the Nest DI token; the Mongoose
 * implementation is bound in `UsersModule` and replaced by an in-memory one in
 * tests.
 */
export abstract class UsersRepository {
  /** Includes the password hash — only for credential verification. */
  abstract findByEmail(email: string): Promise<UserRecord | null>;

  abstract findById(id: string): Promise<UserRecord | null>;

  /** Returns `null` when the unique email index rejects the insert. */
  abstract create(input: CreateUserInput): Promise<UserRecord | null>;

  abstract existsByEmail(email: string): Promise<boolean>;

  /**
   * Applies a status change **only** when the account is still in `expected`.
   * Returns `null` when another admin changed it first, which the service turns
   * into a 409 instead of silently overwriting the newer decision.
   */
  abstract updateStatus(
    id: string,
    expected: CustomerStatus,
    input: UpdateStatusInput,
  ): Promise<UserRecord | null>;

  /** Records a phone number learned at checkout; never overwrites an existing one. */
  abstract setPhoneIfMissing(id: string, phone: string): Promise<void>;
}
