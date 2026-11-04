import { randomUUID } from 'node:crypto';
import { Role } from '../../src/common/enums/role.enum.js';
import type { CustomerStatus } from '../../src/modules/users/customer-status.js';
import { resolveStatus } from '../../src/modules/users/customer-status.js';
import type {
  CreateUserInput,
  UpdateStatusInput,
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
      status: 'active',
      phone: input.phone,
      statusHistory: [],
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

  async updateStatus(
    id: string,
    expected: CustomerStatus,
    input: UpdateStatusInput,
  ): Promise<UserRecord | null> {
    const current = this.users.get(id);

    // Mirrors the guarded `findOneAndUpdate({ status: expected })`.
    if (!current || current.status !== expected) {
      return null;
    }

    const next: UserRecord = {
      ...current,
      status: input.status,
      isActive: input.status === 'active',
      statusHistory: [...current.statusHistory, input.entry],
      updatedAt: new Date(),
    };

    this.users.set(id, next);

    return next;
  }

  async setPhoneIfMissing(id: string, phone: string): Promise<void> {
    const current = this.users.get(id);

    if (!current || current.phone || !phone.trim()) {
      return;
    }

    this.users.set(id, { ...current, phone: phone.trim(), updatedAt: new Date() });
  }

  /**
   * Test helper: insert a user directly (e.g. the seeded admin).
   *
   * `status` / `statusHistory` default so older tests that only know about
   * `isActive` keep working.
   */
  seed(
    record: Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'statusHistory'> & {
      id?: string;
      status?: CustomerStatus;
      statusHistory?: UserRecord['statusHistory'];
    },
  ): UserRecord {
    const now = new Date();
    const stored: UserRecord = {
      ...record,
      status: record.status ?? resolveStatus({ isActive: record.isActive }),
      statusHistory: record.statusHistory ?? [],
      id: record.id ?? randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(stored.id, stored);

    return stored;
  }

  /**
   * Test hook: jump an account to a status without going through the state
   * machine. Used only to reset fixtures between tests.
   */
  forceStatus(id: string, status: CustomerStatus): void {
    const current = this.users.get(id);

    if (!current) {
      return;
    }

    this.users.set(id, {
      ...current,
      status,
      isActive: status === 'active',
      // A reset starts a clean audit trail; real transitions never clear it.
      statusHistory: [],
      updatedAt: new Date(),
    });
  }

  /** Test hook: every stored user (the customer read model needs them). */
  all(): UserRecord[] {
    return [...this.users.values()];
  }

  count(role?: Role): number {
    return [...this.users.values()].filter((user) => !role || user.role === role)
      .length;
  }
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}
