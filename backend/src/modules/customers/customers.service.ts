import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { createPaginatedResult } from '../../common/utils/pagination.util.js';
import type { PaginatedResult } from '../../common/utils/pagination.util.js';
import { SessionsRepository } from '../auth/repositories/sessions.repository.js';
import { OrdersService } from '../orders/orders.service.js';
import type { OrdersQueryDto } from '../orders/dto/orders-query.dto.js';
import type { OrderView } from '../orders/orders.service.js';
import { CUSTOMER_STATUS_LABELS, canChangeStatus, isCustomerStatus } from '../users/customer-status.js';
import type { CustomerStatus } from '../users/customer-status.js';
import type { StatusHistoryEntry } from '../users/repositories/users.repository.js';
import { UsersService } from '../users/users.service.js';
import type { CustomersQueryDto } from './dto/customers-query.dto.js';
import type { UpdateCustomerStatusDto } from './dto/update-customer-status.dto.js';
import { CustomersRepository } from './repositories/customers.repository.js';
import type {
  CustomerAddress,
  CustomerListFilter,
  CustomerOverview,
  CustomerRecord,
} from './repositories/customers.repository.js';

/** A customer as the console sees it. Never contains credentials or tokens. */
export interface CustomerView {
  id: string;
  email: string;
  firstName: string;
  lastName?: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  status: CustomerStatus;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
  metrics: {
    totalOrders: number;
    successfulOrders: number;
    /** Net of processed refunds, in minor units. */
    totalSpent: number;
    refundedAmount: number;
    pendingRefundAmount: number;
    /** `totalSpent / successfulOrders`, in minor units. */
    averageOrderValue: number;
    firstOrderAt: string | null;
    lastOrderAt: string | null;
  };
}

export interface CustomerActivityEntry {
  kind: 'account_created' | 'status_changed';
  label: string;
  detail?: string;
  at: string;
  by?: string | null;
}

export interface CustomerDetailView extends CustomerView {
  statusHistory: Array<{
    from: CustomerStatus;
    to: CustomerStatus;
    fromLabel: string;
    toLabel: string;
    reason?: string;
    note?: string;
    by: string | null;
    at: string;
  }>;
  addresses: Array<Omit<CustomerAddress, 'lastUsedAt'> & { lastUsedAt: string }>;
  activity: CustomerActivityEntry[];
}

export interface CustomerOverviewView extends CustomerOverview {
  /** Net spending across all customers, in minor units. */
  totalNetSpent: number;
  currency: string;
}

/** Hard ceiling on a CSV export so one click cannot stream the whole database. */
export const MAX_EXPORT_ROWS = 5_000;
const EXPORT_PAGE_SIZE = 250;

/**
 * Customer management (admin side).
 *
 * Composes three owners instead of duplicating them:
 * - `CustomersRepository` — read model (users joined with their orders),
 * - `UsersService` — the only writer of account state,
 * - `OrdersService` — order history for one customer.
 *
 * Suspending or deactivating never touches orders, payments or invoices: history
 * belongs to the business, not to the account state.
 */
@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly customersRepository: CustomersRepository,
    private readonly usersService: UsersService,
    private readonly sessionsRepository: SessionsRepository,
    private readonly ordersService: OrdersService,
  ) {}

  async list(query: CustomersQueryDto): Promise<PaginatedResult<CustomerView>> {
    const { items, total } = await this.customersRepository.list(this.toFilter(query));

    return createPaginatedResult(
      items.map((customer) => this.toView(customer)),
      query.page,
      query.limit,
      total,
    );
  }

  async detail(id: string): Promise<CustomerDetailView> {
    const customer = await this.requireCustomer(id);
    const addresses = await this.customersRepository.addresses(customer.id);

    return {
      ...this.toView(customer),
      statusHistory: customer.statusHistory.map((entry) => ({
        from: entry.from,
        to: entry.to,
        fromLabel: CUSTOMER_STATUS_LABELS[entry.from],
        toLabel: CUSTOMER_STATUS_LABELS[entry.to],
        reason: entry.reason,
        note: entry.note,
        by: entry.by?.email ?? null,
        at: entry.at.toISOString(),
      })),
      addresses: addresses.map((address) => ({
        ...address,
        lastUsedAt: address.lastUsedAt.toISOString(),
      })),
      activity: this.buildActivity(customer),
    };
  }

  /** Spending / order summary for one customer (same maths as the list row). */
  async summary(id: string): Promise<CustomerView> {
    return this.toView(await this.requireCustomer(id));
  }

  /** Org-wide analytics — real counts and sums, no projections. */
  async overview(): Promise<CustomerOverviewView> {
    const overview = await this.customersRepository.overview();

    return { ...overview, currency: 'INR' };
  }

  /**
   * Order history for one customer.
   *
   * Uses the order module's own listing (same filters, same views) scoped to the
   * customer, so nothing about order presentation is re-implemented here.
   */
  async orders(
    id: string,
    query: OrdersQueryDto,
  ): Promise<PaginatedResult<OrderView>> {
    const customer = await this.requireCustomer(id);

    return this.ordersService.listForUser(customer.id, query);
  }

  /**
   * Account status change.
   *
   * Rules: customers only (never another admin), legal transitions only, reason
   * recorded, admin recorded. Suspending/deactivating also revokes every refresh
   * session so the change takes effect immediately instead of at the next refresh.
   */
  async changeStatus(
    id: string,
    dto: UpdateCustomerStatusDto,
    actor: AuthenticatedUser,
  ): Promise<CustomerDetailView> {
    const customer = await this.requireCustomer(id);
    const from = customer.status;
    const to = dto.status;

    if (!isCustomerStatus(to)) {
      throw new BadRequestException('Unknown customer status');
    }

    if (from === to) {
      throw new BadRequestException(
        `This customer is already ${CUSTOMER_STATUS_LABELS[to].toLowerCase()}`,
      );
    }

    if (!canChangeStatus(from, to)) {
      throw new BadRequestException(
        `Cannot move an account from ${CUSTOMER_STATUS_LABELS[from].toLowerCase()} to ${CUSTOMER_STATUS_LABELS[to].toLowerCase()}`,
      );
    }

    const entry: StatusHistoryEntry = {
      from,
      to,
      reason: dto.reason,
      note: dto.note,
      by: { userId: actor.id, email: actor.email },
      at: new Date(),
    };

    const updated = await this.usersService.changeStatus(id, from, {
      status: to,
      entry,
    });

    if (!updated) {
      throw new ConflictException(
        'This customer changed while you were editing it — reload and try again',
      );
    }

    let revokedSessions = 0;

    if (to !== 'active') {
      revokedSessions = await this.revokeSessions(id);
    }

    this.logger.log(
      `Customer ${updated.email}: ${from} → ${to} by ${actor.email}` +
        (revokedSessions > 0 ? ` (${revokedSessions} session(s) revoked)` : ''),
    );

    return this.detail(id);
  }

  /**
   * CSV of the filtered customer set.
   *
   * Runs with the same filters as the table (but without pagination), stops at
   * `MAX_EXPORT_ROWS`, and only ever emits the columns listed below — no hashes,
   * tokens or free-form internals.
   */
  async exportCsv(query: CustomersQueryDto): Promise<string> {
    const filter = this.toFilter(query);
    const rows: CustomerRecord[] = [];
    let page = 1;

    while (rows.length < MAX_EXPORT_ROWS) {
      const { items, total } = await this.customersRepository.list({
        ...filter,
        page,
        limit: EXPORT_PAGE_SIZE,
      });

      rows.push(...items);

      if (items.length < EXPORT_PAGE_SIZE || rows.length >= total) {
        break;
      }

      page += 1;
    }

    const lines: string[][] = [
      [
        'Customer ID',
        'First name',
        'Last name',
        'Email',
        'Phone',
        'Status',
        'Registered at',
        'Total orders',
        'Successful orders',
        'Net spend',
        'Refunded',
        'Pending refunds',
        'Last order at',
      ],
      ...rows.slice(0, MAX_EXPORT_ROWS).map((customer) => [
        customer.id,
        customer.firstName,
        customer.lastName ?? '',
        customer.email,
        customer.phone ?? '',
        CUSTOMER_STATUS_LABELS[customer.status],
        customer.createdAt.toISOString(),
        String(customer.metrics.totalOrders),
        String(customer.metrics.successfulOrders),
        money(customer.metrics.netSpent),
        money(customer.metrics.refundedAmount),
        money(customer.metrics.pendingRefundAmount),
        customer.metrics.lastOrderAt?.toISOString() ?? '',
      ]),
    ];

    return lines.map((line) => line.map(csvCell).join(',')).join('\r\n');
  }

  // ------------------------------------------------------------------ internals

  /**
   * Loads a customer and refuses anything that is not a customer account.
   * Admins are deliberately not manageable through this module.
   */
  private async requireCustomer(id: string): Promise<CustomerRecord> {
    const customer = await this.customersRepository.findById(id);

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  private toFilter(query: CustomersQueryDto): CustomerListFilter {
    if (
      query.minSpent !== undefined &&
      query.maxSpent !== undefined &&
      query.minSpent > query.maxSpent
    ) {
      throw new BadRequestException('minSpent cannot be greater than maxSpent');
    }

    return {
      page: query.page,
      limit: query.limit,
      search: query.search?.trim() || undefined,
      status: query.status,
      from: query.from,
      to: query.to,
      minSpent: query.minSpent,
      maxSpent: query.maxSpent,
      hasOrders: query.hasOrders,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };
  }

  private toView(customer: CustomerRecord): CustomerView {
    const { metrics } = customer;

    return {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      fullName: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
      phone: customer.phone,
      avatarUrl: customer.avatarUrl,
      status: customer.status,
      statusLabel: CUSTOMER_STATUS_LABELS[customer.status],
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
      metrics: {
        totalOrders: metrics.totalOrders,
        successfulOrders: metrics.successfulOrders,
        totalSpent: metrics.netSpent,
        refundedAmount: metrics.refundedAmount,
        pendingRefundAmount: metrics.pendingRefundAmount,
        averageOrderValue:
          metrics.successfulOrders > 0
            ? Math.round(metrics.netSpent / metrics.successfulOrders)
            : 0,
        firstOrderAt: metrics.firstOrderAt?.toISOString() ?? null,
        lastOrderAt: metrics.lastOrderAt?.toISOString() ?? null,
      },
    };
  }

  private buildActivity(customer: CustomerRecord): CustomerActivityEntry[] {
    const entries: CustomerActivityEntry[] = [
      {
        kind: 'account_created',
        label: 'Account created',
        detail: customer.email,
        at: customer.createdAt.toISOString(),
        by: null,
      },
      ...customer.statusHistory.map((entry) => ({
        kind: 'status_changed' as const,
        label: `${CUSTOMER_STATUS_LABELS[entry.from]} → ${CUSTOMER_STATUS_LABELS[entry.to]}`,
        detail: entry.reason ?? entry.note,
        at: entry.at.toISOString(),
        by: entry.by?.email ?? null,
      })),
    ];

    // Newest first. Entries written in the same millisecond keep a deterministic
    // order (later recorded = newer), which also makes the activity feed testable.
    return entries
      .map((entry, index) => ({ entry, index }))
      .sort(
        (a, b) =>
          new Date(a.entry.at).getTime() - new Date(b.entry.at).getTime() ||
          a.index - b.index,
      )
      .reverse()
      .map(({ entry }) => entry);
  }

  /** Best-effort: a session-store hiccup must not undo a recorded suspension. */
  private async revokeSessions(id: string): Promise<number> {
    try {
      return await this.sessionsRepository.revokeAllForUser(id);
    } catch (error) {
      this.logger.error(
        `Could not revoke sessions for customer ${id}: ${String(error)}`,
      );

      return 0;
    }
  }
}

/** Paise → a plain decimal string, so the CSV opens correctly in a spreadsheet. */
function money(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
