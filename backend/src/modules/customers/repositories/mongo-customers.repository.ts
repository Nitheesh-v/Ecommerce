import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { isValidObjectId, Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { escapeRegex } from '../../../common/utils/regex.util.js';
import { getSkip } from '../../../common/utils/pagination.util.js';
import {
  NET_SPEND_EXPR,
  NON_SPENDING_STATUSES,
  PENDING_REFUND_EXPR,
  PROCESSED_REFUND_EXPR,
} from '../../orders/spending.js';
import { resolveStatus } from '../../users/customer-status.js';
import type { CustomerStatus } from '../../users/customer-status.js';
import type { StatusHistoryEntry } from '../../users/repositories/users.repository.js';
import { EMPTY_METRICS } from './customers.repository.js';
import type {
  CustomerAddress,
  CustomerListFilter,
  CustomerOverview,
  CustomerRecord,
  CustomersRepository,
} from './customers.repository.js';

/** Shape returned by the aggregation (plain object, not a hydrated document). */
interface RawCustomerRow {
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  avatarUrl?: string;
  status?: CustomerStatus;
  isActive?: boolean;
  statusHistory?: Array<{
    from: CustomerStatus;
    to: CustomerStatus;
    reason?: string;
    note?: string;
    by?: { userId: string; email: string } | null;
    at: Date;
  }>;
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  totalOrders?: number;
  successfulOrders?: number;
  netSpent?: number;
  refundedAmount?: number;
  pendingRefundAmount?: number;
  firstOrderAt?: Date | null;
  lastOrderAt?: Date | null;
  lastOrderPhone?: string;
}

/**
 * Customer read model over the `users` collection, joined with `orders`.
 *
 * One aggregation does the whole page: filter → join this page's customers to
 * their orders → derive spending → filter by spending → sort → facet (rows and
 * total). Filtering and sorting by spending therefore stay correct across pages
 * instead of being applied to whatever rows happened to load.
 *
 * The spending definition itself lives in `orders/spending.ts` and is shared with
 * the dashboard; the expressions below are its MongoDB projection.
 */
@Injectable()
export class MongoCustomersRepository implements CustomersRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async list(
    filter: CustomerListFilter,
  ): Promise<{ items: CustomerRecord[]; total: number }> {
    const db = this.getDb();

    const pipeline: Record<string, unknown>[] = [
      { $match: this.userMatch(filter) },
      ...this.metricsStages(),
      ...(filter.minSpent === undefined && filter.maxSpent === undefined
        ? []
        : [
            {
              $match: {
                netSpent: {
                  ...(filter.minSpent === undefined ? {} : { $gte: filter.minSpent }),
                  ...(filter.maxSpent === undefined ? {} : { $lte: filter.maxSpent }),
                },
              },
            },
          ]),
      ...(filter.hasOrders
        ? [{ $match: { successfulOrders: { $gte: 1 } } }]
        : []),
      { $sort: this.sortSpec(filter) },
      {
        $facet: {
          items: [{ $skip: getSkip(filter.page, filter.limit) }, { $limit: filter.limit }],
          meta: [{ $count: 'total' }],
        },
      },
    ];

    const [result] = await db
      .collection('users')
      .aggregate<{ items: RawCustomerRow[]; meta: Array<{ total: number }> }>(pipeline)
      .toArray();

    return {
      items: (result?.items ?? []).map((row) => this.toRecord(row)),
      total: result?.meta[0]?.total ?? 0,
    };
  }

  async findById(id: string): Promise<CustomerRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const db = this.getDb();
    const [row] = await db
      .collection('users')
      .aggregate<RawCustomerRow>([
        { $match: { _id: new Types.ObjectId(id), role: 'customer' } },
        ...this.metricsStages(),
      ])
      .toArray();

    return row ? this.toRecord(row) : null;
  }

  async overview(now = new Date()): Promise<CustomerOverview> {
    const db = this.getDb();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );

    const [result] = await db
      .collection('users')
      .aggregate<{
        totalCustomers: number;
        newThisMonth: number;
        active: number;
        suspended: number;
        deactivated: number;
        repeatCustomers: number;
        buyingCustomers: number;
        totalNetSpent: number;
      }>([
        { $match: { role: 'customer' } },
        ...this.metricsStages(),
        {
          $group: {
            _id: null,
            totalCustomers: { $sum: 1 },
            newThisMonth: {
              $sum: { $cond: [{ $gte: ['$createdAt', monthStart] }, 1, 0] },
            },
            active: { $sum: { $cond: [{ $eq: ['$resolvedStatus', 'active'] }, 1, 0] } },
            suspended: {
              $sum: { $cond: [{ $eq: ['$resolvedStatus', 'suspended'] }, 1, 0] },
            },
            deactivated: {
              $sum: { $cond: [{ $eq: ['$resolvedStatus', 'deactivated'] }, 1, 0] },
            },
            repeatCustomers: {
              $sum: { $cond: [{ $gte: ['$successfulOrders', 2] }, 1, 0] },
            },
            buyingCustomers: {
              $sum: { $cond: [{ $gte: ['$successfulOrders', 1] }, 1, 0] },
            },
            totalNetSpent: { $sum: '$netSpent' },
          },
        },
      ])
      .toArray();

    if (!result) {
      return {
        totalCustomers: 0,
        newThisMonth: 0,
        active: 0,
        suspended: 0,
        deactivated: 0,
        repeatCustomers: 0,
        buyingCustomers: 0,
        totalNetSpent: 0,
        averageSpend: 0,
      };
    }

    return {
      ...result,
      averageSpend:
        result.buyingCustomers > 0
          ? Math.round(result.totalNetSpent / result.buyingCustomers)
          : 0,
    };
  }

  async addresses(id: string): Promise<CustomerAddress[]> {
    if (!isValidObjectId(id)) {
      return [];
    }

    const db = this.getDb();
    const rows = await db
      .collection('orders')
      .aggregate<{
        _id: string;
        address: CustomerAddress;
        orderNumber: string;
        lastUsedAt: Date;
      }>([
        { $match: { userId: new Types.ObjectId(id) } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: {
              line1: '$shippingAddress.line1',
              postalCode: '$shippingAddress.postalCode',
            },
            address: { $first: '$shippingAddress' },
            orderNumber: { $first: '$orderNumber' },
            lastUsedAt: { $first: '$createdAt' },
          },
        },
        { $sort: { lastUsedAt: -1 } },
        { $limit: 10 },
      ])
      .toArray();

    return rows.map((row) => ({
      recipientName: row.address?.recipientName ?? '',
      phone: row.address?.phone ?? '',
      line1: row.address?.line1 ?? '',
      line2: row.address?.line2,
      city: row.address?.city ?? '',
      state: row.address?.state ?? '',
      postalCode: row.address?.postalCode ?? '',
      country: row.address?.country ?? '',
      orderNumber: row.orderNumber,
      lastUsedAt: new Date(row.lastUsedAt),
    }));
  }

  // ------------------------------------------------------------------ helpers

  /**
   * `role: customer` plus the requested filters.
   *
   * Documents created before this phase have no `status`; the `status` filter
   * therefore also matches the legacy `isActive` shape so nobody disappears from
   * the console until a backfill runs.
   */
  private userMatch(filter: CustomerListFilter): Record<string, unknown> {
    const match: Record<string, unknown> = { role: 'customer' };

    if (filter.status) {
      match.$and = [statusClause(filter.status)];
    }

    if (filter.from || filter.to) {
      match.createdAt = {
        ...(filter.from ? { $gte: filter.from } : {}),
        ...(filter.to ? { $lte: filter.to } : {}),
      };
    }

    if (filter.search) {
      const rx = new RegExp(escapeRegex(filter.search), 'i');

      match.$or = [
        { email: rx },
        { firstName: rx },
        { lastName: rx },
        { phone: rx },
      ];
    }

    return match;
  }

  /**
   * Derives per-customer figures from the customer's orders.
   *
   * Must run before any `$match`/`$sort` that references `netSpent` or
   * `successfulOrders`.
   */
  private metricsStages(): Record<string, unknown>[] {
    return [
      {
        $lookup: {
          from: 'orders',
          let: { uid: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$userId', '$$uid'] } } },
            {
              $addFields: {
                processedRefund: PROCESSED_REFUND_EXPR,
                pendingRefund: PENDING_REFUND_EXPR,
              },
            },
            {
              $addFields: {
                // Shared expression: max(0, paidAmount − processed refunds).
                netSpent: NET_SPEND_EXPR,
                // Same rule as `isSuccessfulPurchase()` in orders/spending.ts.
                successful: {
                  $and: [
                    { $gt: [{ $ifNull: ['$payment.paidAmount', 0] }, 0] },
                    { $not: { $in: ['$status', [...NON_SPENDING_STATUSES]] } },
                  ],
                },
              },
            },
            {
              $project: {
                createdAt: 1,
                customerPhone: 1,
                netSpent: 1,
                successful: 1,
                processedRefund: 1,
                pendingRefund: 1,
              },
            },
          ],
          as: 'orderRows',
        },
      },
      {
        $addFields: {
          resolvedStatus: {
            $ifNull: [
              '$status',
              {
                $cond: [{ $eq: ['$isActive', false] }, 'deactivated', 'active'],
              },
            ],
          },
          totalOrders: { $size: '$orderRows' },
          refundedAmount: { $sum: '$orderRows.processedRefund' },
          pendingRefundAmount: { $sum: '$orderRows.pendingRefund' },
          successfulRows: {
            $filter: {
              input: '$orderRows',
              as: 'order',
              cond: '$$order.successful',
            },
          },
          lastOrder: {
            $reduce: {
              input: '$orderRows',
              initialValue: null,
              in: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$$value', null] },
                      { $gt: ['$$this.createdAt', '$$value.createdAt'] },
                    ],
                  },
                  '$$this',
                  '$$value',
                ],
              },
            },
          },
          firstOrderAt: { $min: '$orderRows.createdAt' },
        },
      },
      {
        $addFields: {
          successfulOrders: { $size: '$successfulRows' },
          netSpent: {
            $sum: {
              $map: {
                input: '$successfulRows',
                as: 'order',
                in: '$$order.netSpent',
              },
            },
          },
          lastOrderAt: '$lastOrder.createdAt',
          lastOrderPhone: '$lastOrder.customerPhone',
        },
      },
    ];
  }

  private sortSpec(filter: CustomerListFilter): Record<string, unknown> {
    const direction = filter.sortOrder === 'asc' ? 1 : -1;

    switch (filter.sortBy) {
      case 'netSpent':
        // Newest first breaks ties so the order of equal spenders is stable.
        return { netSpent: direction, createdAt: -1, _id: 1 };
      case 'name':
        return { firstName: direction, lastName: direction, _id: 1 };
      default:
        return { createdAt: direction, _id: 1 };
    }
  }

  private toRecord(row: RawCustomerRow): CustomerRecord {
    return {
      id: String(row._id),
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone || row.lastOrderPhone || undefined,
      avatarUrl: row.avatarUrl,
      status: resolveStatus(row),
      statusHistory: (row.statusHistory ?? []) as StatusHistoryEntry[],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      metrics: {
        ...EMPTY_METRICS,
        totalOrders: row.totalOrders ?? 0,
        successfulOrders: row.successfulOrders ?? 0,
        netSpent: row.netSpent ?? 0,
        refundedAmount: row.refundedAmount ?? 0,
        pendingRefundAmount: row.pendingRefundAmount ?? 0,
        firstOrderAt: row.firstOrderAt ?? null,
        lastOrderAt: row.lastOrderAt ?? null,
        lastOrderPhone: row.lastOrderPhone,
      },
    };
  }

  private getDb() {
    const db = this.connection?.db;

    if (!db) {
      throw new ServiceUnavailableException('Database connection is not ready');
    }

    return db;
  }
}

function statusClause(status: CustomerStatus): Record<string, unknown> {
  if (status === 'active') {
    return {
      $or: [
        { status: 'active' },
        { status: { $exists: false }, isActive: { $ne: false } },
        { status: null, isActive: { $ne: false } },
      ],
    };
  }

  return {
    $or: [
      { status },
      { status: { $exists: false }, isActive: false },
      { status: null, isActive: false },
    ],
  };
}
