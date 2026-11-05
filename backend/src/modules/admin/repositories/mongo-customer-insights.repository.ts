import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { Order } from '../../orders/schemas/order.schema.js';
import { CustomerInsightsRepository } from './customer-insights.repository.js';
import type {
  CustomerReportSummary,
  TopCustomerRow,
} from './customer-insights.repository.js';

interface RangeRow {
  key: string;
  name: string;
  email: string;
  orders: number;
  spend: number;
  lastOrderAt: Date;
}

/**
 * Customer analytics over the `orders` collection.
 *
 * A customer is identified by `userId` when they were signed in, otherwise by their
 * lower-cased email — the same identity rule the coupon engine uses, so a guest
 * checkout and a signed-in checkout of the same person still count as one customer
 * only if they used the same address.
 *
 * "New" means the customer's **first ever** order fell inside the range, which is
 * why there is a second (cheap, keyset-bounded) query: a first-in-range order is not
 * the same thing as a new customer.
 */
@Injectable()
export class MongoCustomerInsightsRepository implements CustomerInsightsRepository {
  constructor(@InjectModel(Order.name) private readonly orderModel: Model<Order>) {}

  async summary(from: Date, to: Date): Promise<CustomerReportSummary> {
    const { rows, firstOrderAt } = await this.rangeStats(from, to);
    const activeCustomers = rows.length;
    const repeatCustomers = rows.filter((row) => row.orders > 1).length;
    const orders = rows.reduce((sum, row) => sum + row.orders, 0);
    const spend = rows.reduce((sum, row) => sum + row.spend, 0);
    const newCustomers = rows.filter((row) => {
      const first = firstOrderAt.get(row.key);

      return first !== undefined && first.getTime() >= from.getTime();
    }).length;

    return {
      newCustomers,
      repeatCustomers,
      activeCustomers,
      repeatRate:
        activeCustomers === 0
          ? 0
          : Math.round((repeatCustomers / activeCustomers) * 1000) / 10,
      ordersPerCustomer:
        activeCustomers === 0 ? 0 : Math.round((orders / activeCustomers) * 10) / 10,
      averageOrderValue: orders === 0 ? 0 : Math.round(spend / orders),
    };
  }

  async topCustomers(
    from: Date,
    to: Date,
    limit: number,
  ): Promise<TopCustomerRow[]> {
    const { rows } = await this.rangeStats(from, to);

    return rows
      .slice()
      .sort((a, b) => b.spend - a.spend || b.orders - a.orders)
      .slice(0, limit)
      .map((row) => ({
        id: OBJECT_ID.test(row.key) ? row.key : null,
        name: row.name,
        email: row.email,
        orders: row.orders,
        spend: row.spend,
        lastOrderAt: row.lastOrderAt.toISOString(),
      }));
  }

  /**
   * One pass over the range, plus a bounded lookup of each customer's first order.
   */
  private async rangeStats(
    from: Date,
    to: Date,
  ): Promise<{ rows: RangeRow[]; firstOrderAt: Map<string, Date> }> {
    const grouped = await this.orderModel.aggregate<{
      _id: string;
      orders: number;
      spend: number;
      lastOrderAt: Date;
      name: string;
      email: string;
    }>([
      {
        $match: {
          createdAt: { $gte: from, $lte: to },
          // A cancelled order is not a purchase; refunded ones still are.
          status: { $ne: 'cancelled' },
        },
      },
      {
        $group: {
          _id: { $ifNull: ['$userId', { $toLower: '$customerEmail' }] },
          orders: { $sum: 1 },
          spend: { $sum: '$total' },
          lastOrderAt: { $max: '$createdAt' },
          name: { $last: '$customerName' },
          email: { $last: '$customerEmail' },
        },
      },
    ]);

    const rows: RangeRow[] = grouped.map((row) => ({
      key: String(row._id),
      name: row.name ?? 'Guest',
      email: row.email ?? '',
      orders: row.orders,
      spend: row.spend,
      lastOrderAt: new Date(row.lastOrderAt),
    }));

    if (rows.length === 0) {
      return { rows, firstOrderAt: new Map() };
    }

    const ids = rows
      .map((row) => row.key)
      .filter((key) => OBJECT_ID.test(key))
      .map((key) => new Types.ObjectId(key));
    const emails = rows
      .filter((row) => !OBJECT_ID.test(row.key) && row.key.includes('@'))
      .map((row) => row.key);

    const firsts = await this.orderModel.aggregate<{ _id: string; first: Date }>([
      {
        $match: {
          $or: [
            ...(ids.length > 0 ? [{ userId: { $in: ids } }] : []),
            ...(emails.length > 0 ? [{ customerEmail: { $in: emails } }] : []),
          ],
        },
      },
      {
        $group: {
          _id: { $ifNull: ['$userId', { $toLower: '$customerEmail' }] },
          first: { $min: '$createdAt' },
        },
      },
    ]);

    return {
      rows,
      firstOrderAt: new Map(
        firsts.map((entry) => [String(entry._id), new Date(entry.first)]),
      ),
    };
  }
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;
