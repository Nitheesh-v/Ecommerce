import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { createPaginatedResult } from '../../common/utils/pagination.util.js';
import type { PaginatedResult } from '../../common/utils/pagination.util.js';
import { ORDER_STATUS_LABELS } from '../orders/order-status.js';
import { OrdersService } from '../orders/orders.service.js';
import type { OrderRecord } from '../orders/repositories/orders.repository.js';
import type { OrderStatus } from '../orders/schemas/order.schema.js';
import type { OrdersQueryDto } from '../orders/dto/orders-query.dto.js';
import { CourierRegistry } from './courier/courier-provider.js';
import type {
  CourierProviderDescriptor,
  CourierProviderId,
} from './courier/courier-provider.js';
import type { CreateShipmentDto } from './dto/create-shipment.dto.js';
import type {
  UpdateShipmentCourierDto,
  UpdateShipmentStatusDto,
} from './dto/update-shipment.dto.js';
import type {
  EligibleOrdersQueryDto,
  ShipmentsQueryDto,
} from './dto/shipments-query.dto.js';
import { ShipmentsRepository } from './repositories/shipments.repository.js';
import type {
  ShipmentActor,
  ShipmentEventRecord,
  ShipmentRecord,
  ShipmentSummaryRecord,
} from './repositories/shipments.repository.js';
import {
  canTransitionShipment,
  DELIVERY_FLOW,
  deliveryProgress,
  isDelayed,
  SHIPMENT_STATUS_LABELS,
} from './shipment-status.js';
import type { ShipmentStatus } from './schemas/shipment.schema.js';

export interface ShipmentView {
  id: string;
  shipmentNumber: string;
  orderId: string;
  orderNumber: string;
  customer: { userId: string | null; name: string; email: string };
  status: ShipmentStatus;
  statusLabel: string;
  /** Time-derived: past the promised date and still out for delivery. */
  delayed: boolean;
  courier: {
    provider: string;
    name: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    automated: boolean;
  };
  shippingCost: number;
  weightGrams: number | null;
  dimensions: { lengthCm: number; widthCm: number; heightCm: number } | null;
  estimatedDelivery: string | null;
  shippedAt: string | null;
  actualDelivery: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentDetailView extends ShipmentView {
  /** Internal only — admin views; the customer endpoint never returns it. */
  notes: string | null;
  address: ShipmentRecord['shippingAddress'];
  order: {
    id: string;
    orderNumber: string;
    status: string;
    statusLabel: string;
    paymentStatus: string;
    total: number;
    currency: string;
    createdAt: string;
    itemCount: number;
    items: Array<{ name: string; sku: string; quantity: number; lineTotal: number }>;
  };
  events: Array<{
    id: string;
    type: string;
    from: ShipmentStatus | null;
    to: ShipmentStatus | null;
    label: string;
    reason: string | null;
    note: string | null;
    source: string;
    by: string | null;
    at: string;
  }>;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface ShipmentHistoryView {
  events: ShipmentDetailView['events'];
}

/** Customer-safe projection: no cost, no internal notes, no admin identity. */
export interface TrackingView {
  orderId: string;
  orderNumber: string;
  shipmentNumber: string;
  status: ShipmentStatus;
  statusLabel: string;
  courier: { name: string; trackingNumber: string | null; trackingUrl: string | null };
  estimatedDelivery: string | null;
  shippedAt: string | null;
  actualDelivery: string | null;
  failureReason: string | null;
  progress: number;
  steps: Array<{ status: ShipmentStatus; label: string; reached: boolean }>;
  events: Array<{ status: ShipmentStatus | null; label: string; at: string }>;
}

export interface EligibleOrderView {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  statusLabel: string;
  paymentStatus: string;
  paymentMethod: string;
  total: number;
  currency: string;
  itemCount: number;
  createdAt: string;
  addressLine: string;
}

export interface CourierOptionsView {
  providers: CourierProviderDescriptor[];
  /** `true` when only the manual workflow is usable. */
  manualOnly: boolean;
}

const SHIPPABLE_ORDER_STATUSES: OrderStatus[] = ['confirmed', 'processing'];
const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{6,19}$/;

/**
 * Shipping & delivery.
 *
 * Rules this service enforces:
 * 1. **One live shipment per order.** A second is a `409`, including under a
 *    concurrent double-click (the database index is the final arbiter). A
 *    replacement is only possible after `returned_to_sender`.
 * 2. **Money before parcels.** An order ships only when it is paid or is a
 *    cash-on-delivery order. Payment status is never modified here.
 * 3. **The parcel decides the order's fulfilment, legally.** Shipment transitions
 *    call `OrdersService.promoteFulfilment()`, which walks real order transitions
 *    and refuses for cancelled/returned orders. Opening a page changes nothing.
 * 4. **Addresses are copied, never re-entered**, so a shipping form cannot divert
 *    a parcel that the customer already paid to deliver somewhere else.
 * 5. **History is append-only**, written in the same atomic update as the change.
 */
@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    private readonly shipments: ShipmentsRepository,
    private readonly ordersService: OrdersService,
    private readonly couriers: CourierRegistry,
  ) {}

  // ------------------------------------------------------------------ create

  async create(dto: CreateShipmentDto, actor: AuthenticatedUser): Promise<ShipmentDetailView> {
    const order = await this.ordersService.getOrderRecord(dto.orderId);

    const latest = await this.shipments.findLatestByOrderId(order.id);

    // A replacement is only allowed once the previous parcel came back to us.
    const replacement = latest?.status === 'returned_to_sender';

    this.assertShippable(order, replacement);
    const address = this.validateAddress(order);

    const live = await this.shipments.findLiveByOrderId(order.id);

    if (live) {
      throw new ConflictException(
        `Order ${order.orderNumber} already has shipment ${live.shipmentNumber} — a second live shipment is not allowed`,
      );
    }

    const provider = this.couriers.requireEnabled(dto.courierProvider);
    const trackingNumber = dto.trackingNumber?.trim() || undefined;
    const trackingUrl = dto.trackingUrl?.trim() || undefined;

    if (trackingUrl && !trackingNumber) {
      throw new BadRequestException('A tracking link requires a tracking number');
    }

    const now = new Date();
    const courier = {
      provider: provider.id,
      name: this.couriers.resolveName(provider, dto.courierName),
      ...(trackingNumber ? { trackingNumber } : {}),
      ...(trackingUrl ? { trackingUrl } : {}),
    };

    const shipmentNumber = await this.shipments.nextShipmentNumber(now);
    const event: ShipmentEventRecord = {
      eventId: randomUUID(),
      type: 'created',
      to: 'pending',
      note: `Shipment created for ${order.orderNumber}`,
      source: 'admin',
      by: this.toActor(actor),
      at: now,
    };

    const created = await this.shipments.create({
      shipmentNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      shippingAddress: address,
      courier,
      status: 'pending',
      shippingCost: dto.shippingCost,
      weightGrams: dto.weightGrams,
      dimensions: dto.dimensions,
      notes: dto.notes?.trim() || undefined,
      estimatedDelivery: dto.estimatedDelivery,
      createdBy: this.toActor(actor),
      event,
    });

    if (!created) {
      // Lost the race against another create: the unique index rejected this one.
      throw new ConflictException(
        `Order ${order.orderNumber} already has a live shipment`,
      );
    }

    await this.ordersService.applyShipmentMirror(
      order.id,
      {
        provider: courier.name,
        ...(trackingNumber ? { trackingNumber } : {}),
        ...(trackingUrl ? { trackingUrl } : {}),
        ...(dto.estimatedDelivery ? { estimatedDelivery: dto.estimatedDelivery } : {}),
      },
      actor,
      `Shipment ${created.shipmentNumber} created (${courier.name})`,
    );

    this.logger.log(`shipment ${created.shipmentNumber} created for ${order.orderNumber}`);

    return this.detail(created.id);
  }

  // ------------------------------------------------------------------ status

  async updateStatus(
    id: string,
    dto: UpdateShipmentStatusDto,
    actor: AuthenticatedUser,
  ): Promise<ShipmentDetailView> {
    const shipment = await this.requireShipment(id);
    const from = shipment.status;
    const to = dto.status;

    if (from === to) {
      throw new BadRequestException(
        `The shipment is already ${SHIPMENT_STATUS_LABELS[to].toLowerCase()}`,
      );
    }
    if (!canTransitionShipment(from, to)) {
      throw new ConflictException(
        `Cannot move a shipment from ${SHIPMENT_STATUS_LABELS[from]} to ${SHIPMENT_STATUS_LABELS[to]}`,
      );
    }
    if ((to === 'delivery_failed' || to === 'returned_to_sender') && !dto.reason?.trim()) {
      throw new BadRequestException(
        'A reason is required for a failed delivery or a return to sender',
      );
    }
    if (to === 'shipped' && (!shipment.courier.name || !shipment.courier.trackingNumber)) {
      throw new BadRequestException(
        'Assign a courier and a tracking number before marking the parcel as shipped',
      );
    }

    const now = new Date();
    const event: ShipmentEventRecord = {
      eventId: randomUUID(),
      type: 'status',
      from,
      to,
      reason: trimmedOrUndefined(dto.reason),
      note: dto.note?.trim() || undefined,
      source: 'admin',
      by: this.toActor(actor),
      at: now,
    };

    const updated = await this.shipments.update(
      id,
      { status: [from] },
      {
        status: to,
        updatedBy: this.toActor(actor),
        ...(to === 'shipped' && !shipment.shippedAt ? { shippedAt: now } : {}),
        ...(to === 'delivered' ? { actualDelivery: dto.actualDelivery ?? now } : {}),
        ...(to === 'delivery_failed' || to === 'returned_to_sender'
          ? { failureReason: dto.reason?.trim() }
          : {}),
      },
      event,
    );

    if (!updated) {
      throw new ConflictException(
        'This shipment changed while it was being updated — reload to see it',
      );
    }

    await this.syncOrder(updated, actor, dto.reason?.trim());

    return this.detail(updated.id);
  }

  async updateCourier(
    id: string,
    dto: UpdateShipmentCourierDto,
    actor: AuthenticatedUser,
  ): Promise<ShipmentDetailView> {
    const shipment = await this.requireShipment(id);

    if (shipment.status === 'delivered' || shipment.status === 'returned_to_sender') {
      throw new ConflictException(
        'The courier cannot change after delivery is finalised',
      );
    }

    const provider = this.couriers.requireEnabled(dto.courierProvider);
    const sameProvider = shipment.courier.provider === provider.id;
    const trackingNumber = dto.trackingNumber?.trim() || (sameProvider ? shipment.courier.trackingNumber : undefined);
    const trackingUrl = dto.trackingUrl?.trim() || (sameProvider ? shipment.courier.trackingUrl : undefined);

    if (trackingUrl && !trackingNumber) {
      throw new BadRequestException('A tracking link requires a tracking number');
    }

    const courier = {
      provider: provider.id,
      name: this.couriers.resolveName(provider, dto.courierName),
      ...(trackingNumber ? { trackingNumber } : {}),
      ...(trackingUrl ? { trackingUrl } : {}),
    };
    const now = new Date();

    const updated = await this.shipments.update(
      id,
      { status: [shipment.status] },
      { courier, updatedBy: this.toActor(actor) },
      {
        eventId: randomUUID(),
        type: 'courier',
        from: shipment.status,
        to: shipment.status,
        reason: dto.reason?.trim(),
        note: `Courier set to ${courier.name}${trackingNumber ? ` (AWB ${trackingNumber})` : ''}`,
        source: 'admin',
        by: this.toActor(actor),
        at: now,
      },
    );

    if (!updated) {
      throw new ConflictException(
        'This shipment changed while the courier was being updated — reload to see it',
      );
    }

    await this.ordersService.applyShipmentMirror(
      shipment.orderId,
      {
        provider: courier.name,
        ...(trackingNumber ? { trackingNumber } : {}),
        ...(trackingUrl ? { trackingUrl } : {}),
      },
      actor,
      `Courier updated to ${courier.name}${trackingNumber ? ` (AWB ${trackingNumber})` : ''}`,
    );

    return this.detail(updated.id);
  }

  // ------------------------------------------------------------------- reads

  async list(query: ShipmentsQueryDto): Promise<PaginatedResult<ShipmentView>> {
    const now = new Date();
    const { items, total } = await this.shipments.list({
      page: query.page,
      limit: query.limit,
      search: query.search?.trim(),
      status: query.status,
      courier: query.courier?.trim(),
      from: query.from,
      to: query.to,
      delayedOnly: query.delayed === true,
      now,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return createPaginatedResult(
      items.map((shipment) => this.toView(shipment, now)),
      query.page,
      query.limit,
      total,
    );
  }

  async summary(): Promise<ShipmentSummaryRecord> {
    return this.shipments.summary(new Date());
  }

  async detail(id: string): Promise<ShipmentDetailView> {
    const shipment = await this.requireShipment(id);
    const order = await this.ordersService.getOrderRecord(shipment.orderId);

    return this.toDetailView(shipment, order);
  }

  async history(id: string): Promise<ShipmentHistoryView> {
    const shipment = await this.requireShipment(id);

    return { events: this.toEventViews(shipment) };
  }

  courierOptions(): CourierOptionsView {
    const providers = this.couriers.list();

    return {
      providers,
      manualOnly: providers.filter((provider) => provider.enabled).length === 1,
    };
  }

  /** Orders that can actually ship right now, for the create dialog. */
  async eligibleOrders(query: EligibleOrdersQueryDto): Promise<EligibleOrderView[]> {
    const pages = await Promise.all(
      SHIPPABLE_ORDER_STATUSES.map((status) =>
        this.ordersService.list({
          page: 1,
          limit: query.limit,
          search: query.search?.trim(),
          status,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        } as OrdersQueryDto),
      ),
    );

    const candidates = pages
      .flatMap((page) => page.data)
      .filter((order) => this.canShipPayment(order))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const live = new Set(
      await this.shipments.liveOrderIds(candidates.map((order) => order.id)),
    );

    return candidates
      .filter((order) => !live.has(order.id))
      .slice(0, query.limit)
      .map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        status: order.status,
        statusLabel: ORDER_STATUS_LABELS[order.status],
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        total: order.total,
        currency: order.currency,
        itemCount: order.itemCount,
        createdAt: order.createdAt.toISOString(),
        addressLine: [
          order.shippingAddress.line1,
          order.shippingAddress.city,
          order.shippingAddress.state,
          order.shippingAddress.postalCode,
        ]
          .filter(Boolean)
          .join(', '),
      }));
  }

  // ---------------------------------------------------------------- tracking

  /**
   * Customer tracking.
   *
   * Ownership is decided by `OrdersService.getOrderRecordFor()`: another
   * customer's order is a `404`, never a `403` existence leak. The projection is
   * deliberately narrower than the admin one — no cost, no internal notes, no
   * staff identities.
   */
  async tracking(orderId: string, user: AuthenticatedUser): Promise<TrackingView> {
    const order = await this.ordersService.getOrderRecordFor(orderId, user);
    const shipment = await this.shipments.findLatestByOrderId(order.id);

    if (!shipment) {
      throw new NotFoundException('No shipment has been created for this order yet');
    }

    return this.toTrackingView(order, shipment);
  }

  // --------------------------------------------------------------- internals

  /** Shipment transitions that must move the order's fulfilment, mapped legally. */
  private async syncOrder(
    shipment: ShipmentRecord,
    actor: AuthenticatedUser,
    reason?: string,
  ): Promise<void> {
    const target =
      shipment.status === 'shipped'
        ? 'shipped'
        : shipment.status === 'in_transit' || shipment.status === 'out_for_delivery'
          ? 'out_for_delivery'
          : shipment.status === 'delivered'
            ? 'delivered'
            : null;

    // Mirrors are written even when the order does not move (dates, courier).
    if (target) {
      try {
        const order = await this.ordersService.getOrderRecord(shipment.orderId);
        const blocked =
          order.status === 'cancelled' ||
          order.status === 'returned' ||
          order.status === 'return_requested';

        if (!blocked) {
          await this.ordersService.promoteFulfilment(
            order.id,
            target,
            actor,
            reason ?? `Shipment ${shipment.shipmentNumber} is ${SHIPMENT_STATUS_LABELS[shipment.status].toLowerCase()}`,
          );
        } else {
          this.logger.warn(
            `Shipment ${shipment.shipmentNumber} moved to ${shipment.status} but order ${order.orderNumber} is ${order.status} — fulfilment left untouched`,
          );
        }
      } catch (error) {
        // A parcel's real movement is not undone by an order-side conflict, but it
        // must be visible: the console shows both statuses side by side.
        this.logger.error(
          `Could not advance order for shipment ${shipment.shipmentNumber}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        throw error;
      }
    }

    await this.ordersService.applyShipmentMirror(
      shipment.orderId,
      {
        provider: shipment.courier.name,
        ...(shipment.courier.trackingNumber
          ? { trackingNumber: shipment.courier.trackingNumber }
          : {}),
        ...(shipment.courier.trackingUrl
          ? { trackingUrl: shipment.courier.trackingUrl }
          : {}),
        ...(shipment.shippedAt ? { shippedAt: shipment.shippedAt } : {}),
        ...(shipment.estimatedDelivery
          ? { estimatedDelivery: shipment.estimatedDelivery }
          : {}),
        ...(shipment.actualDelivery ? { deliveredAt: shipment.actualDelivery } : {}),
      },
      actor,
      `Shipment ${shipment.shipmentNumber}: ${SHIPMENT_STATUS_LABELS[shipment.status]}`,
    );
  }

  private canShipPayment(
    order: Pick<OrderRecord, 'paymentStatus' | 'paymentMethod'>,
  ): boolean {
    return (
      order.paymentStatus === 'paid' ||
      order.paymentMethod === 'cod' ||
      order.paymentMethod === 'manual'
    );
  }

  private assertShippable(order: OrderRecord, replacement = false): void {
    // A replacement (after `returned_to_sender`) necessarily happens on an order
    // that already moved forward, so those further fulfilment stages are allowed
    // for that one case — still never a cancelled, returned or delivered order.
    const shippable: OrderStatus[] = replacement
      ? [...SHIPPABLE_ORDER_STATUSES, 'shipped', 'out_for_delivery']
      : SHIPPABLE_ORDER_STATUSES;

    if (!shippable.includes(order.status)) {
      throw new ConflictException(
        `A shipment can only be created for a confirmed or processing order (this one is ${ORDER_STATUS_LABELS[order.status].toLowerCase()})`,
      );
    }
    if (!this.canShipPayment(order)) {
      throw new ConflictException(
        order.paymentMethod === 'cod'
          ? 'This order has no payment recorded yet'
          : 'This order is not paid yet — only a paid order (or a cash-on-delivery order) can ship',
      );
    }
  }

  /** Required fields of the order's address snapshot, validated once more. */
  private validateAddress(order: OrderRecord): ShipmentRecord['shippingAddress'] {
    const address = order.shippingAddress;
    const required: Array<[string, string]> = [
      ['recipientName', address.recipientName],
      ['phone', address.phone],
      ['line1', address.line1],
      ['city', address.city],
      ['state', address.state],
      ['postalCode', address.postalCode],
    ];
    const missing = required.filter(([, value]) => !String(value ?? '').trim()).map(([key]) => key);

    if (missing.length > 0) {
      throw new BadRequestException(
        `The order's shipping address is incomplete (missing: ${missing.join(', ')})`,
      );
    }
    if (!PHONE_PATTERN.test(address.phone.trim())) {
      throw new BadRequestException(
        'The order\'s shipping phone number is not a valid contact number',
      );
    }

    return {
      recipientName: address.recipientName.trim(),
      phone: address.phone.trim(),
      line1: address.line1.trim(),
      line2: address.line2?.trim(),
      city: address.city.trim(),
      state: address.state.trim(),
      postalCode: address.postalCode.trim(),
      country: address.country?.trim() || 'India',
    };
  }

  private async requireShipment(id: string): Promise<ShipmentRecord> {
    const shipment = await this.shipments.findById(id);

    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    return shipment;
  }

  private toActor(actor: AuthenticatedUser): ShipmentActor {
    return { userId: actor.id, email: actor.email };
  }

  private toView(shipment: ShipmentRecord, now = new Date()): ShipmentView {
    const provider = this.courierProvider(shipment.courier.provider);

    return {
      id: shipment.id,
      shipmentNumber: shipment.shipmentNumber,
      orderId: shipment.orderId,
      orderNumber: shipment.orderNumber,
      customer: {
        userId: shipment.userId,
        name: shipment.customerName,
        email: shipment.customerEmail,
      },
      status: shipment.status,
      statusLabel: SHIPMENT_STATUS_LABELS[shipment.status],
      delayed: isDelayed(shipment.status, shipment.estimatedDelivery, now),
      courier: {
        provider: shipment.courier.provider,
        name: shipment.courier.name,
        trackingNumber: shipment.courier.trackingNumber ?? null,
        trackingUrl: shipment.courier.trackingUrl ?? null,
        automated: provider?.automated ?? false,
      },
      shippingCost: shipment.shippingCost,
      weightGrams: shipment.weightGrams ?? null,
      dimensions: shipment.dimensions ?? null,
      estimatedDelivery: shipment.estimatedDelivery?.toISOString() ?? null,
      shippedAt: shipment.shippedAt?.toISOString() ?? null,
      actualDelivery: shipment.actualDelivery?.toISOString() ?? null,
      failureReason: shipment.failureReason ?? null,
      createdAt: shipment.createdAt.toISOString(),
      updatedAt: shipment.updatedAt.toISOString(),
    };
  }

  private toDetailView(shipment: ShipmentRecord, order: OrderRecord): ShipmentDetailView {
    return {
      ...this.toView(shipment),
      notes: shipment.notes ?? null,
      address: shipment.shippingAddress,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        statusLabel: ORDER_STATUS_LABELS[order.status],
        paymentStatus: order.paymentStatus,
        total: order.total,
        currency: order.currency,
        createdAt: order.createdAt.toISOString(),
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        items: order.items.map((item) => ({
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
        })),
      },
      events: this.toEventViews(shipment),
      createdBy: shipment.createdBy?.email ?? null,
      updatedBy: shipment.updatedBy?.email ?? null,
    };
  }

  private toEventViews(shipment: ShipmentRecord): ShipmentDetailView['events'] {
    return [...shipment.events]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .map((event) => ({
        id: event.eventId,
        type: event.type,
        from: event.from ?? null,
        to: event.to ?? null,
        label: this.eventLabel(event),
        reason: event.reason ?? null,
        note: event.note ?? null,
        source: event.source,
        by: event.by?.email ?? null,
        at: event.at.toISOString(),
      }));
  }

  private eventLabel(event: ShipmentEventRecord): string {
    if (event.type === 'created') {
      return 'Shipment created';
    }
    if (event.type === 'courier') {
      return 'Courier updated';
    }
    if (event.type === 'note') {
      return 'Note added';
    }
    if (event.to) {
      return SHIPMENT_STATUS_LABELS[event.to];
    }

    return 'Status updated';
  }

  private toTrackingView(order: OrderRecord, shipment: ShipmentRecord): TrackingView {
    /** Highest happy-path milestone ever reached, so a failure keeps its progress. */
    const highest = shipment.events.reduce((max, event) => {
      const index = Math.max(
        event.to ? deliveryProgress(event.to) : -1,
        event.from ? deliveryProgress(event.from) : -1,
      );

      return Math.max(max, index);
    }, deliveryProgress(shipment.status));

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      shipmentNumber: shipment.shipmentNumber,
      status: shipment.status,
      statusLabel: SHIPMENT_STATUS_LABELS[shipment.status],
      courier: {
        name: shipment.courier.name,
        trackingNumber: shipment.courier.trackingNumber ?? null,
        trackingUrl: shipment.courier.trackingUrl ?? null,
      },
      estimatedDelivery: shipment.estimatedDelivery?.toISOString() ?? null,
      shippedAt: shipment.shippedAt?.toISOString() ?? null,
      actualDelivery: shipment.actualDelivery?.toISOString() ?? null,
      failureReason: shipment.failureReason ?? null,
      progress: Math.max(0, highest),
      steps: DELIVERY_FLOW.map((status, index) => ({
        status,
        label: SHIPMENT_STATUS_LABELS[status],
        reached: index <= highest,
      })),
      // Customer-safe: statuses and times only — never an internal note or actor.
      events: [...shipment.events]
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .filter((event) => event.type !== 'note')
        .map((event) => ({
          status: event.to ?? event.from ?? null,
          label:
            event.type === 'courier'
              ? 'Courier assigned'
              : this.eventLabel(event),
          at: event.at.toISOString(),
        })),
    };
  }

  private courierProvider(id: string): CourierProviderDescriptor | null {
    try {
      return this.couriers.get(id);
    } catch {
      return null;
    }
  }
}

/** Trims an optional reason without inventing one. */
function trimmedOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}
