import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import type { AlertLevel } from '../schemas/inventory-alert.schema.js';
import type { MovementType } from '../schemas/inventory-movement.schema.js';
import {
  InventoryRepository,
  type AlertRecord,
  type InventoryProduct,
  type InventoryQuery,
  type InventoryRow,
  type InventorySummary,
  type MovementInput,
  type MovementQuery,
  type MovementRecord,
  type StockMutation,
  type StockStatus,
} from './inventory.repository.js';

/** Raw shapes of the documents this repository reads. Kept local and typed. */
interface ProductLike {
  _id: unknown;
  name?: string;
  slug?: string;
  sku?: string;
  categoryId?: unknown;
  price?: number;
  costPrice?: number | null;
  stock?: number;
  lowStockThreshold?: number;
  status?: string;
  images?: Array<{ url?: string }>;
  updatedAt?: Date;
  createdAt?: Date;
}

interface MovementLike {
  _id: unknown;
  productId: unknown;
  productName?: string;
  sku?: string;
  type: MovementType;
  reason?: MovementInput['reason'];
  notes?: string;
  direction: 'increase' | 'decrease';
  previousQuantity: number;
  changedQuantity: number;
  newQuantity: number;
  performedBy?: { userId?: string; email?: string } | null;
  referenceId?: string;
  source?: string;
  createdAt: Date;
}

interface AlertLike {
  _id: Types.ObjectId;
  productId: unknown;
  productName?: string;
  sku?: string;
  level: AlertLevel;
  status: 'open' | 'resolved';
  quantity: number;
  lowStockThreshold: number;
  createdAt: Date;
}

const DEFAULT_THRESHOLD = 5;
const INACTIVE_STATUSES = ['archived'];

/**
 * MongoDB implementation of the inventory persistence boundary.
 *
 * Contract with the `products` collection (single source of truth for `stock`):
 *
 * - `stock` (number, ≥ 0), `lowStockThreshold` (number, default 5)
 * - `price`, `costPrice` in minor units; `costPrice` is admin-only
 * - `status`: `draft | published | archived` (archived rows are excluded)
 * - `images[0].url` is used as the table thumbnail
 *
 * Every quantity change is a single atomic `findOneAndUpdate`:
 * - increase → `$inc: { stock: +n }`
 * - decrease → `$inc: { stock: -n }` **guarded** by `stock: { $gte: n }`, so two
 *   concurrent buyers can never take the last unit twice;
 * - set      → `$set: { stock: n }` (explicit "set exact quantity").
 *
 * The pre-image returned by `findOneAndUpdate` gives the previous quantity
 * without a second read, which is what makes the audit numbers trustworthy.
 */
@Injectable()
export class MongoInventoryRepository implements InventoryRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async listProducts(
    query: InventoryQuery,
  ): Promise<{ items: InventoryRow[]; total: number }> {
    const db = this.getDb();
    const match: Record<string, unknown> = {
      status: { $nin: INACTIVE_STATUSES },
    };

    if (query.categoryId) {
      match.categoryId = toObjectId(query.categoryId);
    }
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      match.$or = [{ name: rx }, { sku: rx }];
    }

    const sort: Record<string, 1 | -1> = {
      [sortField(query.sortBy)]: query.sortOrder === 'asc' ? 1 : -1,
    };

    const pipeline = [
      { $match: match },
      { $addFields: { stockStatus: stockStatusExpression } },
      ...(query.stockStatus
        ? [{ $match: { stockStatus: query.stockStatus } }]
        : []),
      {
        $facet: {
          items: [
            { $sort: sort },
            { $skip: (query.page - 1) * query.limit },
            { $limit: query.limit },
            {
              $lookup: {
                from: 'categories',
                localField: 'categoryId',
                foreignField: '_id',
                as: 'category',
                pipeline: [{ $project: { name: 1 } }],
              },
            },
            {
              $project: {
                name: 1,
                slug: 1,
                sku: 1,
                categoryId: 1,
                price: 1,
                costPrice: 1,
                stock: 1,
                lowStockThreshold: 1,
                stockStatus: 1,
                status: 1,
                images: 1,
                updatedAt: 1,
                categoryName: { $first: '$category.name' },
              },
            },
          ],
          meta: [{ $count: 'total' }],
        },
      },
    ];

    const [facet] = await db
      .collection('products')
      .aggregate<{
        items: Array<ProductLike & { categoryName?: string; stockStatus: StockStatus }>;
        meta: Array<{ total: number }>;
      }>(pipeline)
      .toArray();

    const items = (facet?.items ?? []).map((product) => this.toRow(product));
    return { items, total: facet?.meta[0]?.total ?? 0 };
  }

  async summary(): Promise<InventorySummary> {
    const db = this.getDb();
    const threshold = { $ifNull: ['$lowStockThreshold', DEFAULT_THRESHOLD] };
    const nonNegativeStock = { $max: ['$stock', 0] };

    const [facet] = await db
      .collection('products')
      .aggregate<{
        stats: Array<{
          totalProducts: number;
          totalUnits: number;
          inStockProducts: number;
          lowStockProducts: number;
          outOfStockProducts: number;
          inventoryValue: number;
          retailValue: number;
        }>;
        byCategory: Array<{
          _id: unknown;
          products: number;
          units: number;
          value: number;
          name?: string;
        }>;
        lowStock: Array<ProductLike>;
      }>([
        { $match: { status: { $nin: INACTIVE_STATUSES } } },
        {
          $facet: {
            stats: [
              {
                $group: {
                  _id: null,
                  totalProducts: { $sum: 1 },
                  totalUnits: { $sum: nonNegativeStock },
                  inStockProducts: {
                    $sum: { $cond: [{ $gt: ['$stock', threshold] }, 1, 0] },
                  },
                  lowStockProducts: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $gt: ['$stock', 0] },
                            { $lte: ['$stock', threshold] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  outOfStockProducts: {
                    $sum: { $cond: [{ $lte: ['$stock', 0] }, 1, 0] },
                  },
                  inventoryValue: {
                    $sum: {
                      $multiply: [{ $ifNull: ['$costPrice', 0] }, nonNegativeStock],
                    },
                  },
                  retailValue: {
                    $sum: { $multiply: [{ $ifNull: ['$price', 0] }, nonNegativeStock] },
                  },
                },
              },
            ],
            byCategory: [
              {
                $group: {
                  _id: '$categoryId',
                  products: { $sum: 1 },
                  units: { $sum: nonNegativeStock },
                  value: {
                    $sum: {
                      $multiply: [{ $ifNull: ['$costPrice', 0] }, nonNegativeStock],
                    },
                  },
                },
              },
              { $sort: { units: -1 } },
              { $limit: 6 },
              {
                $lookup: {
                  from: 'categories',
                  localField: '_id',
                  foreignField: '_id',
                  as: 'category',
                  pipeline: [{ $project: { name: 1 } }],
                },
              },
              { $addFields: { name: { $first: '$category.name' } } },
            ],
            lowStock: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $gt: ['$stock', 0] },
                      { $lte: ['$stock', threshold] },
                    ],
                  },
                },
              },
              { $sort: { stock: 1 } },
              { $limit: 5 },
              { $project: { name: 1, sku: 1, stock: 1, lowStockThreshold: 1 } },
            ],
          },
        },
      ])
      .toArray();

    const stats = facet?.stats[0] ?? {
      totalProducts: 0,
      totalUnits: 0,
      inStockProducts: 0,
      lowStockProducts: 0,
      outOfStockProducts: 0,
      inventoryValue: 0,
      retailValue: 0,
    };

    return {
      ...stats,
      inventoryValue: Math.round(stats.inventoryValue),
      retailValue: Math.round(stats.retailValue),
      byCategory: (facet?.byCategory ?? []).map((group) => ({
        categoryId: String(group._id ?? ''),
        name: group.name ?? 'Uncategorised',
        products: group.products,
        units: group.units,
        value: Math.round(group.value),
      })),
      topLowStock: (facet?.lowStock ?? []).map((product) => ({
        productId: String(product._id),
        name: product.name ?? '',
        sku: product.sku ?? '',
        stock: product.stock ?? 0,
        lowStockThreshold: product.lowStockThreshold ?? DEFAULT_THRESHOLD,
      })),
    };
  }

  async findProduct(productId: string): Promise<InventoryProduct | null> {
    const id = toObjectId(productId);
    if (!id) {
      return null;
    }
    const product = (await this.getDb()
      .collection('products')
      .findOne({ _id: id })) as ProductLike | null;
    return product ? toInventoryProduct(product) : null;
  }

  async increase(productId: string, quantity: number): Promise<StockMutation | null> {
    const id = toObjectId(productId);
    if (!id) {
      return null;
    }
    const before = (await this.getDb()
      .collection('products')
      .findOneAndUpdate(
        { _id: id },
        { $inc: { stock: quantity }, $set: { updatedAt: new Date() } },
        { returnDocument: 'before', projection: productProjection },
      )) as ProductLike | null;

    if (!before) {
      return null;
    }
    const previous = before.stock ?? 0;
    return { previous, next: previous + quantity, product: toInventoryProduct(before) };
  }

  async decrease(
    productId: string,
    quantity: number,
  ): Promise<StockMutation | { insufficient: true; available: number } | null> {
    const id = toObjectId(productId);
    if (!id) {
      return null;
    }
    const collection = this.getDb().collection('products');

    // The guard lives in the filter, so the check-and-decrement is one atomic op.
    const before = (await collection.findOneAndUpdate(
      { _id: id, stock: { $gte: quantity } },
      { $inc: { stock: -quantity }, $set: { updatedAt: new Date() } },
      { returnDocument: 'before', projection: productProjection },
    )) as ProductLike | null;

    if (before) {
      const previous = before.stock ?? 0;
      return { previous, next: previous - quantity, product: toInventoryProduct(before) };
    }

    // Either the product is gone or there was not enough stock.
    const exists = await collection.findOne({ _id: id }, { projection: productProjection });
    return exists ? { insufficient: true, available: (exists as ProductLike).stock ?? 0 } : null;
  }

  async setQuantity(productId: string, quantity: number): Promise<StockMutation | null> {
    const id = toObjectId(productId);
    if (!id) {
      return null;
    }
    const before = (await this.getDb()
      .collection('products')
      .findOneAndUpdate(
        { _id: id },
        { $set: { stock: quantity, updatedAt: new Date() } },
        { returnDocument: 'before', projection: productProjection },
      )) as ProductLike | null;

    if (!before) {
      return null;
    }
    return {
      previous: before.stock ?? 0,
      next: quantity,
      product: toInventoryProduct(before),
    };
  }

  async applyDelta(productId: string, delta: number): Promise<void> {
    const id = toObjectId(productId);
    if (!id) {
      return;
    }
    await this.getDb()
      .collection('products')
      .updateOne(
        { _id: id },
        { $inc: { stock: delta }, $set: { updatedAt: new Date() } },
      );
  }

  async recordMovement(
    input: MovementInput,
  ): Promise<{ movement: MovementRecord; created: boolean }> {
    const collection = this.getDb().collection('inventory_movements');
    try {
      const result = await collection.insertOne({
        productId: toObjectId(input.productId),
        productName: input.productName,
        sku: input.sku,
        type: input.type,
        reason: input.reason,
        notes: input.notes,
        direction: input.direction,
        previousQuantity: input.previousQuantity,
        changedQuantity: input.changedQuantity,
        newQuantity: input.newQuantity,
        performedBy: input.performedBy ?? null,
        referenceId: input.referenceId,
        source: input.source,
        createdAt: new Date(),
      });
      return {
        created: true,
        movement: {
        id: String(result.insertedId),
        productId: input.productId,
        productName: input.productName,
        sku: input.sku,
        type: input.type,
        reason: input.reason,
        notes: input.notes,
        direction: input.direction,
        previousQuantity: input.previousQuantity,
        changedQuantity: input.changedQuantity,
        newQuantity: input.newQuantity,
        performedBy: input.performedBy ?? null,
        referenceId: input.referenceId,
        source: input.source,
        createdAt: new Date(),
        },
      };
    } catch (error) {
      // Duplicate reference+type: another request already logged this event.
      if (isDuplicateKeyError(error) && input.referenceId) {
        const existing = await this.findMovement(input.referenceId, input.type);
        if (existing) {
          return { movement: existing, created: false };
        }
      }
      throw error;
    }
  }

  async findMovement(
    referenceId: string,
    type: MovementType,
  ): Promise<MovementRecord | null> {
    const movement = (await this.getDb()
      .collection('inventory_movements')
      .findOne({ referenceId, type })) as MovementLike | null;
    return movement ? toMovement(movement) : null;
  }

  async listMovements(
    query: MovementQuery,
  ): Promise<{ items: MovementRecord[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (query.productId) {
      filter.productId = toObjectId(query.productId);
    }
    if (query.type) {
      filter.type = query.type;
    }
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ productName: rx }, { sku: rx }, { referenceId: rx }];
    }
    if (query.from || query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }

    const collection = this.getDb().collection('inventory_movements');
    const [items, total] = await Promise.all([
      collection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .toArray(),
      collection.countDocuments(filter),
    ]);

    return {
      items: items.map((item) => toMovement(item as MovementLike)),
      total,
    };
  }

  async openAlert(input: {
    productId: string;
    productName: string;
    sku: string;
    level: AlertLevel;
    quantity: number;
    lowStockThreshold: number;
  }): Promise<{ alert: AlertRecord; created: boolean }> {
    const collection = this.getDb().collection('inventory_alerts');
    const productId = toObjectId(input.productId);

    try {
      const result = await collection.updateOne(
        { productId, level: input.level, status: 'open' },
        {
          $setOnInsert: {
            productId,
            productName: input.productName,
            sku: input.sku,
            level: input.level,
            status: 'open',
            quantity: input.quantity,
            lowStockThreshold: input.lowStockThreshold,
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );

      const created = result.upsertedCount > 0;
      const alert = (await collection.findOne({
        productId,
        level: input.level,
        status: 'open',
      })) as AlertLike | null;

      // Keep the snapshot quantity fresh without creating a second alert.
      if (alert && !created) {
        await collection.updateOne(
          { _id: alert._id },
          { $set: { quantity: input.quantity, updatedAt: new Date() } },
        );
      }

      return {
        alert: toAlert(
          alert ?? {
            _id: result.upsertedId ?? new Types.ObjectId(),
            productId,
            productName: input.productName,
            sku: input.sku,
            level: input.level,
            status: 'open',
            quantity: input.quantity,
            lowStockThreshold: input.lowStockThreshold,
            createdAt: new Date(),
          },
        ),
        created,
      };
    } catch (error) {
      // Unique partial index raced with another writer: reuse the open alert.
      if (isDuplicateKeyError(error)) {
        const alert = (await collection.findOne({
          productId,
          level: input.level,
          status: 'open',
        })) as AlertLike | null;
        if (alert) {
          return { alert: toAlert(alert), created: false };
        }
      }
      throw error;
    }
  }

  async resolveAlerts(productId: string, level?: AlertLevel): Promise<number> {
    const filter: Record<string, unknown> = {
      productId: toObjectId(productId),
      status: 'open',
    };
    if (level) {
      filter.level = level;
    }
    const result = await this.getDb()
      .collection('inventory_alerts')
      .updateMany(
        filter,
        { $set: { status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() } },
      );
    return result.modifiedCount;
  }

  async listAlerts(options?: { level?: AlertLevel }): Promise<AlertRecord[]> {
    const filter: Record<string, unknown> = { status: 'open' };
    if (options?.level) {
      filter.level = options.level;
    }
    const alerts = await this.getDb()
      .collection('inventory_alerts')
      .find(filter)
      .sort({ level: 1, createdAt: -1 })
      .toArray();
    return alerts.map((alert) => toAlert(alert as AlertLike));
  }

  private getDb() {
    const db = this.connection.db;
    if (!db) {
      throw new ServiceUnavailableException('Database connection is not ready');
    }
    return db;
  }

  private toRow(
    product: ProductLike & { categoryName?: string; stockStatus: StockStatus },
  ): InventoryRow {
    return {
      productId: String(product._id),
      name: product.name ?? '',
      slug: product.slug ?? '',
      sku: product.sku ?? '',
      categoryId: String(product.categoryId ?? ''),
      categoryName: product.categoryName ?? null,
      price: product.price ?? 0,
      costPrice: product.costPrice ?? null,
      stock: product.stock ?? 0,
      lowStockThreshold: product.lowStockThreshold ?? DEFAULT_THRESHOLD,
      stockStatus:
        product.stockStatus ?? deriveStatus(product.stock ?? 0, product.lowStockThreshold),
      status: product.status ?? 'draft',
      imageUrl: product.images?.[0]?.url ?? null,
      updatedAt: product.updatedAt ?? new Date(0),
    };
  }
}

/** Shared threshold expression so list/summary/status can never disagree. */
const stockStatusExpression = {
  $cond: [
    { $lte: ['$stock', 0] },
    'out',
    {
      $cond: [
        { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', DEFAULT_THRESHOLD] }] },
        'low',
        'in',
      ],
    },
  ],
};

const productProjection = {
  name: 1,
  slug: 1,
  sku: 1,
  stock: 1,
  lowStockThreshold: 1,
  status: 1,
  categoryId: 1,
} as const;

export function deriveStatus(stock: number, threshold?: number): StockStatus {
  const limit = threshold ?? DEFAULT_THRESHOLD;
  if (stock <= 0) {
    return 'out';
  }
  return stock <= limit ? 'low' : 'in';
}

function sortField(sortBy: InventoryQuery['sortBy']): string {
  switch (sortBy) {
    case 'name':
      return 'name';
    case 'price':
      return 'price';
    case 'updatedAt':
      return 'updatedAt';
    default:
      return 'stock';
  }
}

function toInventoryProduct(product: ProductLike): InventoryProduct {
  return {
    productId: String(product._id),
    name: product.name ?? '',
    sku: product.sku ?? '',
    stock: product.stock ?? 0,
    lowStockThreshold: product.lowStockThreshold ?? DEFAULT_THRESHOLD,
  };
}

function toMovement(movement: MovementLike): MovementRecord {
  return {
    id: String(movement._id),
    productId: String(movement.productId),
    productName: movement.productName ?? '',
    sku: movement.sku ?? '',
    type: movement.type,
    reason: movement.reason,
    notes: movement.notes,
    direction: movement.direction,
    previousQuantity: movement.previousQuantity,
    changedQuantity: movement.changedQuantity,
    newQuantity: movement.newQuantity,
    performedBy: movement.performedBy ?? null,
    referenceId: movement.referenceId,
    source: movement.source,
    createdAt: movement.createdAt,
  };
}

function toAlert(alert: AlertLike): AlertRecord {
  return {
    id: String(alert._id),
    productId: String(alert.productId),
    productName: alert.productName ?? '',
    sku: alert.sku ?? '',
    level: alert.level,
    status: alert.status,
    quantity: alert.quantity,
    lowStockThreshold: alert.lowStockThreshold,
    createdAt: alert.createdAt,
  };
}

/** Mongoose/Mongo ids arrive as strings from the API; guard before querying. */
function toObjectId(value: string): Types.ObjectId | null {
  return /^[a-f\d]{24}$/i.test(value) ? new Types.ObjectId(value) : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}
