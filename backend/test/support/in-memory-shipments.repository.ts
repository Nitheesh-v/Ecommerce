import { randomBytes } from 'node:crypto';
import {
  isDelayed,
} from '../../src/modules/shipments/shipment-status.js';
import { ShipmentsRepository } from '../../src/modules/shipments/repositories/shipments.repository.js';
import type {
  CreateShipmentInput,
  ShipmentGuard,
  ShipmentListFilter,
  ShipmentRecord,
  ShipmentSummaryRecord,
  ShipmentUpdate,
} from '../../src/modules/shipments/repositories/shipments.repository.js';

/**
 * In-memory shipments repository.
 *
 * Mirrors `MongoShipmentsRepository`: the same "one live shipment per order" rule
 * (a duplicate insert returns `null` exactly like the unique index), the same
 * optimistic status guard, the same search/filter fields and the same summary
 * grouping. Timestamps are copied on write so a caller cannot mutate storage.
 */
export class InMemoryShipmentsRepository implements ShipmentsRepository {
  private readonly shipments = new Map<string, ShipmentRecord>();
  private sequence = 0;

  /** Test fixture helper: stores a shipment as if it had been created. */
  seed(overrides: Partial<ShipmentRecord> & { orderId: string }): ShipmentRecord {
    const now = new Date();
    const shipment: ShipmentRecord = {
      id: overrides.id ?? newObjectIdLike(),
      shipmentNumber:
        overrides.shipmentNumber ??
        `SHP-TEST-${(++this.sequence).toString().padStart(4, '0')}`,
      orderId: overrides.orderId,
      orderNumber: overrides.orderNumber ?? 'ORD-TEST-0001',
      userId: overrides.userId ?? null,
      customerName: overrides.customerName ?? 'Test Customer',
      customerEmail: overrides.customerEmail ?? 'customer@example.com',
      shippingAddress:
        overrides.shippingAddress ?? {
          recipientName: 'Test Customer',
          phone: '+91 90000 00001',
          line1: '10 Curzon Street',
          city: 'Coimbatore',
          state: 'Tamil Nadu',
          postalCode: '641001',
          country: 'India',
        },
      courier:
        overrides.courier ?? { provider: 'manual', name: 'Manual courier' },
      status: overrides.status ?? 'pending',
      shippingCost: overrides.shippingCost ?? 0,
      weightGrams: overrides.weightGrams,
      dimensions: overrides.dimensions,
      notes: overrides.notes,
      estimatedDelivery: overrides.estimatedDelivery,
      shippedAt: overrides.shippedAt,
      actualDelivery: overrides.actualDelivery,
      failureReason: overrides.failureReason,
      createdBy: overrides.createdBy ?? null,
      updatedBy: overrides.updatedBy ?? null,
      events: overrides.events ? [...overrides.events] : [],
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.updatedAt ?? now,
    };

    this.shipments.set(shipment.id, shipment);

    return this.copy(shipment);
  }

  async nextShipmentNumber(now = new Date()): Promise<string> {
    const day = now.toISOString().slice(0, 10).replaceAll('-', '');

    return `SHP-${day}-${(++this.sequence).toString().padStart(4, '0')}`;
  }

  async create(input: CreateShipmentInput): Promise<ShipmentRecord | null> {
    if (this.isLiveForOrder(input.orderId)) {
      // The partial unique index rejects the second live shipment.
      return null;
    }

    const now = new Date();
    const shipment: ShipmentRecord = {
      id: newObjectIdLike(),
      shipmentNumber: input.shipmentNumber,
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      userId: input.userId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      shippingAddress: { ...input.shippingAddress },
      courier: { ...input.courier },
      status: input.status,
      shippingCost: input.shippingCost,
      weightGrams: input.weightGrams,
      dimensions: input.dimensions ? { ...input.dimensions } : undefined,
      notes: input.notes,
      estimatedDelivery: input.estimatedDelivery,
      shippedAt: undefined,
      actualDelivery: undefined,
      failureReason: undefined,
      createdBy: input.createdBy,
      updatedBy: null,
      events: [{ ...input.event }],
      createdAt: now,
      updatedAt: now,
    };

    this.shipments.set(shipment.id, shipment);

    return this.copy(shipment);
  }

  async findById(id: string): Promise<ShipmentRecord | null> {
    const shipment = this.shipments.get(id);

    return shipment ? this.copy(shipment) : null;
  }

  async findLatestByOrderId(orderId: string): Promise<ShipmentRecord | null> {
    const matches = this.forOrder(orderId);

    return matches.length > 0 ? this.copy(matches[0]) : null;
  }

  async findLiveByOrderId(orderId: string): Promise<ShipmentRecord | null> {
    const live = this.forOrder(orderId).find(
      (shipment) => shipment.status !== 'returned_to_sender',
    );

    return live ? this.copy(live) : null;
  }

  async liveOrderIds(orderIds: string[]): Promise<string[]> {
    const wanted = new Set(orderIds);

    return [
      ...new Set(
        [...this.shipments.values()]
          .filter(
            (shipment) =>
              wanted.has(shipment.orderId) && shipment.status !== 'returned_to_sender',
          )
          .map((shipment) => shipment.orderId),
      ),
    ];
  }

  async list(
    filter: ShipmentListFilter,
  ): Promise<{ items: ShipmentRecord[]; total: number }> {
    const now = filter.now ?? new Date();
    const search = filter.search?.toLowerCase();
    const courier = filter.courier?.toLowerCase();

    const matches = [...this.shipments.values()].filter((shipment) => {
      if (filter.status && shipment.status !== filter.status) {
        return false;
      }
      if (
        courier &&
        shipment.courier.provider.toLowerCase() !== courier &&
        shipment.courier.name.toLowerCase() !== courier
      ) {
        return false;
      }
      if (filter.from && shipment.createdAt.getTime() < filter.from.getTime()) {
        return false;
      }
      if (filter.to && shipment.createdAt.getTime() > filter.to.getTime()) {
        return false;
      }
      if (
        filter.delayedOnly &&
        !isDelayed(shipment.status, shipment.estimatedDelivery, now)
      ) {
        return false;
      }
      if (search) {
        const haystack = [
          shipment.shipmentNumber,
          shipment.orderNumber,
          shipment.customerName,
          shipment.customerEmail,
          shipment.courier.name,
          shipment.courier.trackingNumber ?? '',
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(search)) {
          return false;
        }
      }

      return true;
    });

    matches.sort((a, b) => {
      const direction = filter.sortOrder === 'asc' ? 1 : -1;

      switch (filter.sortBy) {
        case 'estimatedDelivery':
          return (
            ((a.estimatedDelivery?.getTime() ?? Number.MAX_SAFE_INTEGER) -
              (b.estimatedDelivery?.getTime() ?? Number.MAX_SAFE_INTEGER)) *
            direction
          );
        case 'status':
          return a.status.localeCompare(b.status) * direction;
        default:
          return (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
      }
    });

    const start = (filter.page - 1) * filter.limit;

    return {
      items: matches.slice(start, start + filter.limit).map((shipment) => this.copy(shipment)),
      total: matches.length,
    };
  }

  async summary(now = new Date()): Promise<ShipmentSummaryRecord> {
    const all = [...this.shipments.values()];

    return {
      totalCount: all.length,
      readyToShip: this.countByStatus(all, 'ready_to_ship'),
      shipped: this.countByStatus(all, 'shipped'),
      inTransit: this.countByStatus(all, 'in_transit'),
      outForDelivery: this.countByStatus(all, 'out_for_delivery'),
      delivered: this.countByStatus(all, 'delivered'),
      delayed: all.filter(
        (shipment) => isDelayed(shipment.status, shipment.estimatedDelivery, now),
      ).length,
      failed: this.countByStatus(all, 'delivery_failed') + this.countByStatus(all, 'returned_to_sender'),
    };
  }

  async update(
    id: string,
    guard: ShipmentGuard,
    update: ShipmentUpdate,
    event?: ShipmentRecord['events'][number],
  ): Promise<ShipmentRecord | null> {
    const shipment = this.shipments.get(id);

    if (!shipment) {
      return null;
    }
    if (guard.status && !guard.status.includes(shipment.status)) {
      // Someone moved the shipment first: the optimistic guard fails.
      return null;
    }

    const next: ShipmentRecord = {
      ...shipment,
      updatedAt: new Date(),
    };

    if (update.status) {
      next.status = update.status;
    }
    if (update.courier) {
      next.courier = { ...update.courier };
    }
    if (update.notes !== undefined) {
      next.notes = update.notes;
    }
    if (update.estimatedDelivery !== undefined) {
      next.estimatedDelivery = update.estimatedDelivery;
    }
    if (update.shippedAt !== undefined) {
      next.shippedAt = update.shippedAt;
    }
    if (update.actualDelivery !== undefined) {
      next.actualDelivery = update.actualDelivery;
    }
    if (update.failureReason !== undefined) {
      next.failureReason = update.failureReason ?? undefined;
    }
    if (update.updatedBy !== undefined) {
      next.updatedBy = update.updatedBy;
    }
    if (event) {
      next.events = [...shipment.events, { ...event }];
    }

    this.shipments.set(id, next);

    return this.copy(next);
  }

  reset(): void {
    this.shipments.clear();
    this.sequence = 0;
  }

  all(): ShipmentRecord[] {
    return [...this.shipments.values()].map((shipment) => this.copy(shipment));
  }

  private isLiveForOrder(orderId: string): boolean {
    return [...this.shipments.values()].some(
      (shipment) =>
        shipment.orderId === orderId && shipment.status !== 'returned_to_sender',
    );
  }

  private forOrder(orderId: string): ShipmentRecord[] {
    return [...this.shipments.values()]
      .filter((shipment) => shipment.orderId === orderId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  private countByStatus(
    all: ShipmentRecord[],
    status: ShipmentRecord['status'],
  ): number {
    return all.filter((shipment) => shipment.status === status).length;
  }

  private copy(shipment: ShipmentRecord): ShipmentRecord {
    return {
      ...shipment,
      shippingAddress: { ...shipment.shippingAddress },
      courier: { ...shipment.courier },
      dimensions: shipment.dimensions ? { ...shipment.dimensions } : undefined,
      createdBy: shipment.createdBy ? { ...shipment.createdBy } : null,
      updatedBy: shipment.updatedBy ? { ...shipment.updatedBy } : null,
      events: shipment.events.map((event) => ({
        ...event,
        by: event.by ? { ...event.by } : event.by,
      })),
    };
  }
}

function newObjectIdLike(): string {
  return randomBytes(12).toString('hex');
}
