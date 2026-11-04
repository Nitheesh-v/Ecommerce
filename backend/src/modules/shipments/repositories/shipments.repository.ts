import type {
  ShipmentEventSource,
  ShipmentEventType,
  ShipmentStatus,
} from '../schemas/shipment.schema.js';

export interface ShipmentActor {
  userId?: string;
  email?: string;
}

export interface ShipmentAddressRecord {
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface ShipmentCourierRecord {
  provider: string;
  name: string;
  trackingNumber?: string;
  trackingUrl?: string;
}

export interface ShipmentEventRecord {
  eventId: string;
  type: ShipmentEventType;
  from?: ShipmentStatus;
  to?: ShipmentStatus;
  note?: string;
  reason?: string;
  source: ShipmentEventSource;
  by?: ShipmentActor | null;
  at: Date;
}

export interface ShipmentRecord {
  id: string;
  shipmentNumber: string;
  orderId: string;
  orderNumber: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  shippingAddress: ShipmentAddressRecord;
  courier: ShipmentCourierRecord;
  status: ShipmentStatus;
  /** Minor units. */
  shippingCost: number;
  weightGrams?: number;
  dimensions?: { lengthCm: number; widthCm: number; heightCm: number };
  /** Internal admin note — never exposed to customers. */
  notes?: string;
  estimatedDelivery?: Date;
  shippedAt?: Date;
  actualDelivery?: Date;
  failureReason?: string;
  createdBy: ShipmentActor | null;
  updatedBy: ShipmentActor | null;
  events: ShipmentEventRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateShipmentInput {
  shipmentNumber: string;
  orderId: string;
  orderNumber: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  shippingAddress: ShipmentAddressRecord;
  courier: ShipmentCourierRecord;
  status: ShipmentStatus;
  shippingCost: number;
  weightGrams?: number;
  dimensions?: { lengthCm: number; widthCm: number; heightCm: number };
  notes?: string;
  estimatedDelivery?: Date;
  createdBy: ShipmentActor | null;
  event: ShipmentEventRecord;
}

export type ShipmentSortField = 'createdAt' | 'estimatedDelivery' | 'status';
export const SHIPMENT_SORT_FIELDS: ShipmentSortField[] = [
  'createdAt',
  'estimatedDelivery',
  'status',
];

export interface ShipmentListFilter {
  page: number;
  limit: number;
  /** Shipment number, order number, customer name/email or tracking number. */
  search?: string;
  status?: ShipmentStatus;
  /** Courier provider id (`manual`, `shiprocket`…) or a courier name. */
  courier?: string;
  /** Inclusive created-at window. */
  from?: Date;
  to?: Date;
  /** Only parcels past their promised date and still moving. */
  delayedOnly?: boolean;
  /** "Now" for the delayed calculation (injectable for tests). */
  now?: Date;
  sortBy: ShipmentSortField;
  sortOrder: 'asc' | 'desc';
}

export interface ShipmentSummaryRecord {
  totalCount: number;
  readyToShip: number;
  shipped: number;
  inTransit: number;
  outForDelivery: number;
  delivered: number;
  /** Past the promised date and not delivered/returned. */
  delayed: number;
  /** `delivery_failed` + `returned_to_sender`. */
  failed: number;
}

export interface ShipmentUpdate {
  status?: ShipmentStatus;
  courier?: ShipmentCourierRecord;
  notes?: string;
  estimatedDelivery?: Date;
  shippedAt?: Date;
  actualDelivery?: Date;
  failureReason?: string | null;
  updatedBy?: ShipmentActor | null;
}

export interface ShipmentGuard {
  /** Only apply when the stored status is one of these (optimistic guard). */
  status?: ShipmentStatus[];
}

/**
 * Persistence boundary for shipments.
 *
 * `create()` returns `null` when the one-live-shipment-per-order index rejects the
 * insert, so a double-click is a conflict rather than a second parcel.
 */
export abstract class ShipmentsRepository {
  abstract nextShipmentNumber(now?: Date): Promise<string>;

  abstract create(input: CreateShipmentInput): Promise<ShipmentRecord | null>;

  abstract findById(id: string): Promise<ShipmentRecord | null>;

  /** Newest shipment for an order (including a returned one). */
  abstract findLatestByOrderId(orderId: string): Promise<ShipmentRecord | null>;

  /** Shipment holding the order's one live slot, if any. */
  abstract findLiveByOrderId(orderId: string): Promise<ShipmentRecord | null>;

  /** Which of these orders already have a live shipment. */
  abstract liveOrderIds(orderIds: string[]): Promise<string[]>;

  abstract list(
    filter: ShipmentListFilter,
  ): Promise<{ items: ShipmentRecord[]; total: number }>;

  abstract summary(now?: Date): Promise<ShipmentSummaryRecord>;

  /** `null` means the guard failed (the shipment moved in the meantime). */
  abstract update(
    id: string,
    guard: ShipmentGuard,
    update: ShipmentUpdate,
    event?: ShipmentEventRecord,
  ): Promise<ShipmentRecord | null>;
}
