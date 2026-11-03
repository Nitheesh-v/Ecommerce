import { randomUUID } from 'node:crypto';
import { Role } from '../../src/common/enums/role.enum.js';
import type {
  CreateUserInput,
  UserRecord,
  UsersRepository,
} from '../../src/modules/users/repositories/users.repository.js';

/**
 * In-memory stand-in for the Mongoose users repository.
 *
 * Lets auth flows be tested end to end (HTTP, guards, cookies, tokens) without a
 * database, while still exercising the real service and controller code.
 */
export class InMemoryUsersRepository implements UsersRepository {
  private readonly users = new Map<string, UserRecord>();

  async findByEmail(email: string): Promise<UserRecord | null> {
    const normalized = normalize(email);

    return (
      [...this.users.values()].find((user) => user.email === normalized) ?? null
    );
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async create(input: CreateUserInput): Promise<UserRecord | null> {
    const email = normalize(input.email);

    if (await this.existsByEmail(email)) {
      // Mirrors the unique index in MongoDB.
      return null;
    }

    const now = new Date();
    const record: UserRecord = {
      id: randomUUID(),
      email,
      passwordHash: input.passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(record.id, record);

    return record;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const normalized = normalize(email);

    return [...this.users.values()].some((user) => user.email === normalized);
  }

  /** Test helper: insert a user directly (e.g. the seeded admin). */
  seed(record: Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): UserRecord {
    const now = new Date();
    const stored: UserRecord = {
      ...record,
      id: record.id ?? randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(stored.id, stored);

    return stored;
  }

  count(role?: Role): number {
    return [...this.users.values()].filter((user) => !role || user.role === role)
      .length;
  }
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}
