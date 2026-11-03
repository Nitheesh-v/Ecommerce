import type { Role } from '../../../common/enums/role.enum.js';

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
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName?: string;
  role: Role;
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
}
