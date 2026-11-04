/**
 * Shipping & delivery contracts (`/api/admin/shipments`).
 *
 * Mirrors the backend views exactly: money stays in minor units, dates arrive as
 * ISO strings, and the customer-safe tracking projection is a separate type so a
 * component can never accidentally bind to an internal field.
 */

export const SHIPMENT_STATUSES = [
  "pending",
  "ready_to_ship",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "delivery_failed",
  "returned_to_sender",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export type ShipmentSortField = "createdAt" | "estimatedDelivery" | "status";

export type CourierProviderId = "manual" | "shiprocket" | "delhivery" | "bluedart";

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending: "Pending",
  ready_to_ship: "Ready to ship",
  shipped: "Shipped",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  delivery_failed: "Delivery failed",
  returned_to_sender: "Returned to sender",
};

export const SHIPMENT_STATUS_OPTIONS = SHIPMENT_STATUSES.map((value) => ({
  value,
  label: SHIPMENT_STATUS_LABELS[value],
}));

export const COURIER_PROVIDER_LABELS: Record<CourierProviderId, string> = {
  manual: "Manual / own courier",
  shiprocket: "Shiprocket",
  delhivery: "Delhivery",
  bluedart: "Blue Dart",
};

export interface ShipmentCourier {
  provider: string;
  name: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  /** `true` when the partner can be driven through its API. */
  automated: boolean;
}

export interface ShipmentAddress {
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface Shipment {
  id: string;
  shipmentNumber: string;
  orderId: string;
  orderNumber: string;
  customer: { userId: string | null; name: string; email: string };
  status: ShipmentStatus;
  statusLabel: string;
  /** Time-derived: the promised date passed and the parcel has not arrived. */
  delayed: boolean;
  courier: ShipmentCourier;
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

export interface ShipmentEvent {
  id: string;
  type: "created" | "status" | "courier" | "note";
  from: ShipmentStatus | null;
  to: ShipmentStatus | null;
  label: string;
  reason: string | null;
  note: string | null;
  source: "admin" | "system" | "courier";
  by: string | null;
  at: string;
}

export interface ShipmentDetail extends Shipment {
  /** Internal only — never part of the customer projection. */
  notes: string | null;
  address: ShipmentAddress;
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
  events: ShipmentEvent[];
  createdBy: string | null;
  updatedBy: string | null;
}

export interface ShipmentSummary {
  totalCount: number;
  readyToShip: number;
  shipped: number;
  inTransit: number;
  outForDelivery: number;
  delivered: number;
  delayed: number;
  failed: number;
}

export interface CourierProvider {
  id: CourierProviderId;
  name: string;
  automated: boolean;
  enabled: boolean;
  missingConfiguration: string[];
  trackingUrlTemplate?: string;
}

export interface CourierOptions {
  providers: CourierProvider[];
  /** `true` when only the manual workflow is usable on this server. */
  manualOnly: boolean;
}

export interface EligibleOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  status: string;
  statusLabel: string;
  paymentStatus: string;
  paymentMethod: string;
  total: number;
  currency: string;
  itemCount: number;
  createdAt: string;
  addressLine: string;
}

export interface ShipmentListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: ShipmentStatus;
  courier?: string;
  from?: string;
  to?: string;
  delayed?: boolean;
  sortBy?: ShipmentSortField;
  sortOrder?: "asc" | "desc";
}

export interface CreateShipmentInput {
  orderId: string;
  courierProvider?: CourierProviderId;
  courierName?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shippingCost: number;
  weightGrams?: number;
  dimensions?: { lengthCm: number; widthCm: number; heightCm: number };
  estimatedDelivery?: string;
  notes?: string;
}

export interface UpdateShipmentStatusInput {
  status: ShipmentStatus;
  reason?: string;
  note?: string;
  actualDelivery?: string;
}

export interface UpdateShipmentCourierInput {
  courierProvider: CourierProviderId;
  courierName?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  reason?: string;
}

/** Customer-safe tracking (`GET /api/orders/:id/tracking`). */
export interface OrderTracking {
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

/** Statuses reachable from the current one — mirrors the backend state machine. */
export const NEXT_SHIPMENT_STATUSES: Record<ShipmentStatus, ShipmentStatus[]> = {
  pending: ["ready_to_ship"],
  ready_to_ship: ["shipped"],
  shipped: ["in_transit", "out_for_delivery", "delivered", "delivery_failed"],
  in_transit: ["out_for_delivery", "delivered", "delivery_failed"],
  out_for_delivery: ["delivered", "delivery_failed"],
  delivery_failed: [
    "shipped",
    "in_transit",
    "out_for_delivery",
    "delivered",
    "returned_to_sender",
  ],
  delivered: [],
  returned_to_sender: [],
};

export function isTerminalShipment(status: ShipmentStatus): boolean {
  return NEXT_SHIPMENT_STATUSES[status].length === 0;
}

/** Reason is mandatory for these outcomes; the backend rejects them otherwise. */
export function requiresReason(status: ShipmentStatus): boolean {
  return status === "delivery_failed" || status === "returned_to_sender";
}
