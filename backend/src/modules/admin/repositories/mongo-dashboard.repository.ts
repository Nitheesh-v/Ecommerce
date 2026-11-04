import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { NET_SPEND_EXPR, SPENDING_MATCH } from '../../orders/spending.js';
import type {
  CategorySalesPoint,
  DashboardMetrics,
  DashboardRepository,
  LowStockSummary,
  RecentCustomerSummary,
  RecentOrderSummary,
  StatusCount,
  TimeSeriesPoint,
  TopProductSummary,
} from './dashboard.repository.js';

/**
 * Aggregation queries for the admin dashboard.
 *
 * These read the collections through the driver (not through hydrated models):
 * analytics only ever needs counts and sums, so skipping document hydration keeps
 * the queries cheap as the store grows.
 *
 * Collection contract (kept in one place so the feature modules and the dashboard
 * cannot drift apart):
 *
 * - `users`    `{ email, firstName, lastName, role, isActive, createdAt }`
 * - `products` `{ name, sku, categoryId, price, stock, lowStockThreshold, status, createdAt }`
 * - `categories` `{ name, slug }`
 * - `orders`   `{ orderNumber, userId, customerName, customerEmail, items[{ productId, name, quantity, unitPrice }],
 *                total, status, paymentStatus, createdAt }`
 *
 * Collections that do not exist yet simply produce empty results, so the
 * dashboard reports honest zeros until the catalog and order modules land.
 */
@Injectable()
export class MongoDashboardRepository implements DashboardRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async getMetrics(from: Date, to: Date): Promise<DashboardMetrics> {
    const db = this.getDb();

    const [revenueAggregation, orders, products, customers, pendingOrders, lowStockProducts] =
      await Promise.all([
        db
          .collection('orders')
          .aggregate<{ revenue: number; paidOrders: number }>([
            { $match: paidOrdersInRange(from, to) },
            {
              $group: {
                _id: null,
                // Net of processed refunds — the same definition customers use.
                revenue: { $sum: NET_SPEND_EXPR },
                paidOrders: { $sum: 1 },
              },
            },
          ])
          .toArray(),
        db.collection('orders').countDocuments({ createdAt: { $gte: from, $lte: to } }),
        db.collection('products').countDocuments({ status: { $ne: 'archived' } }),
        db.collection('users').countDocuments({ role: 'customer' }),
        db.collection('orders').countDocuments({ status: 'pending' }),
        db.collection('products').countDocuments(lowStockFilter()),
      ]);

    const revenue = Math.round(revenueAggregation[0]?.revenue ?? 0);
    const paidOrders = revenueAggregation[0]?.paidOrders ?? 0;

    return {
      revenue,
      orders,
      products,
      customers,
      pendingOrders,
      lowStockProducts,
      averageOrderValue: paidOrders > 0 ? Math.round(revenue / paidOrders) : 0,
    };
  }

  async getRevenueSeries(from: Date, to: Date): Promise<TimeSeriesPoint[]> {
    return this.dailySeries(
      'orders',
      from,
      to,
      { $sum: NET_SPEND_EXPR },
      paidOrdersInRange(from, to),
    );
  }

  async getOrdersSeries(from: Date, to: Date): Promise<TimeSeriesPoint[]> {
    return this.dailySeries('orders', from, to, { $sum: 1 }, {});
  }

  async getOrderStatusDistribution(from: Date, to: Date): Promise<StatusCount[]> {
    const db = this.getDb();

    const rows = await db
      .collection('orders')
      .aggregate<{ status: string; count: number }>([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $project: { _id: 0, status: { $ifNull: ['$_id', 'unknown'] }, count: 1 } },
        { $sort: { count: -1 } },
      ])
      .toArray();

    return rows.map((row) => ({ status: String(row.status), count: row.count }));
  }

  async getSalesByCategory(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<CategorySalesPoint[]> {
    const db = this.getDb();

    const rows = await db
      .collection('orders')
      .aggregate<{ category: string; revenue: number; orders: number }>([
        { $match: paidOrdersInRange(from, to) },
        { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
        {
          $lookup: {
            from: 'products',
            localField: 'items.productId',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'categories',
            localField: 'product.categoryId',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $ifNull: ['$category.name', 'Uncategorised'] },
            revenue: {
              $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] },
            },
            orders: { $addToSet: '$_id' },
          },
        },
        {
          $project: {
            _id: 0,
            category: '$_id',
            revenue: 1,
            orders: { $size: '$orders' },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: limit },
      ])
      .toArray();

    return rows.map((row) => ({
      category: String(row.category),
      revenue: Math.round(row.revenue ?? 0),
      orders: row.orders ?? 0,
    }));
  }

  async getTopProducts(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<TopProductSummary[]> {
    const db = this.getDb();

    const rows = await db
      .collection('orders')
      .aggregate<{
        id: unknown;
        name: string;
        unitsSold: number;
        revenue: number;
      }>([
        { $match: paidOrdersInRange(from, to) },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            name: { $first: '$items.name' },
            unitsSold: { $sum: '$items.quantity' },
            revenue: { $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] } },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: limit },
        { $project: { _id: 0, id: '$_id', name: 1, unitsSold: 1, revenue: 1 } },
      ])
      .toArray();

    return rows.map((row) => ({
      id: String(row.id ?? ''),
      name: String(row.name ?? 'Unknown product'),
      unitsSold: row.unitsSold ?? 0,
      revenue: Math.round(row.revenue ?? 0),
    }));
  }

  async getLowStock(limit: number): Promise<LowStockSummary[]> {
    const db = this.getDb();

    const rows = await db
      .collection('products')
      .find(lowStockFilter())
      .sort({ stock: 1 })
      .limit(limit)
      .toArray();

    return rows.map((row) => ({
      id: String(row._id),
      name: String(row.name ?? 'Unnamed product'),
      sku: String(row.sku ?? '—'),
      stock: Number(row.stock ?? 0),
      lowStockThreshold: Number(row.lowStockThreshold ?? 0),
    }));
  }

  async getRecentOrders(limit: number): Promise<RecentOrderSummary[]> {
    const db = this.getDb();

    const rows = await db
      .collection('orders')
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return rows.map((row) => ({
      id: String(row._id),
      orderNumber: String(row.orderNumber ?? ''),
      customerName: String(row.customerName ?? 'Guest'),
      total: Number(row.total ?? 0),
      status: String(row.status ?? 'pending'),
      paymentStatus: String(row.paymentStatus ?? 'pending'),
      createdAt: new Date(row.createdAt ?? Date.now()).toISOString(),
    }));
  }

  async getRecentCustomers(limit: number): Promise<RecentCustomerSummary[]> {
    const db = this.getDb();

    const rows = await db
      .collection('users')
      .find({ role: 'customer' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return rows.map((row) => ({
      id: String(row._id),
      name: [row.firstName, row.lastName].filter(Boolean).join(' ') || 'Customer',
      email: String(row.email ?? ''),
      createdAt: new Date(row.createdAt ?? Date.now()).toISOString(),
    }));
  }

  private async dailySeries(
    collection: string,
    from: Date,
    to: Date,
    accumulator: Record<string, unknown>,
    extraMatch: Record<string, unknown>,
  ): Promise<TimeSeriesPoint[]> {
    const db = this.getDb();

    const rows = await db
      .collection(collection)
      .aggregate<{ date: string; value: number }>([
        { $match: { createdAt: { $gte: from, $lte: to }, ...extraMatch } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' },
            },
            value: accumulator,
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', value: 1 } },
      ])
      .toArray();

    return rows.map((row) => ({ date: row.date, value: Math.round(row.value ?? 0) }));
  }

  private getDb(): NonNullable<Connection['db']> {
    const db = this.connection.db;

    if (!db) {
      throw new ServiceUnavailableException('Database connection is not ready');
    }

    return db;
  }
}

/**
 * Orders that count as revenue inside the window.
 *
 * Shared with the customer module (`orders/spending.ts`): money actually
 * collected, minus cancelled/returned sales. Revenue is then summed as
 * `paidAmount − processedRefunds`, so a refund lowers revenue on the day it is
 * processed rather than being ignored.
 */
function paidOrdersInRange(from: Date, to: Date): Record<string, unknown> {
  return { createdAt: { $gte: from, $lte: to }, ...SPENDING_MATCH };
}

/** At or below the per-product threshold (default 5 when unset). */
function lowStockFilter(): Record<string, unknown> {
  return {
    $expr: {
      $and: [
        { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', 5] }] },
        { $ne: ['$status', 'archived'] },
      ],
    },
  };
}
