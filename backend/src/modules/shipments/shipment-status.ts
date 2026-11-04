import type { ShipmentStatus } from './schemas/shipment.schema.js';

/**
 * The parcel state machine — the only authority on what may follow what.
 *
 * Rules the machine encodes:
 *  - a parcel must be prepared before it ships (`pending → ready_to_ship → shipped`);
 *  - every in-flight state may end in delivery or a failure (couriers do skip
 *    scans, so `shipped → delivered` and `shipped → out_for_delivery` are legal);
 *  - a failed delivery can be re-attempted or go back to the sender;
 *  - `delivered` and `returned_to_sender` are terminal — nothing re-opens them.
 */
export const ALLOWED_SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  pending: ['ready_to_ship'],
  ready_to_ship: ['shipped'],
  shipped: ['in_transit', 'out_for_delivery', 'delivered', 'delivery_failed'],
  in_transit: ['out_for_delivery', 'delivered', 'delivery_failed'],
  out_for_delivery: ['delivered', 'delivery_failed'],
  delivery_failed: ['shipped', 'in_transit', 'out_for_delivery', 'delivered', 'returned_to_sender'],
  delivered: [],
  returned_to_sender: [],
};

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending: 'Pending',
  ready_to_ship: 'Ready to ship',
  shipped: 'Shipped',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  delivery_failed: 'Delivery failed',
  returned_to_sender: 'Returned to sender',
};

/** The happy path, used to render a customer progress bar. */
export const DELIVERY_FLOW: ShipmentStatus[] = [
  'pending',
  'ready_to_ship',
  'shipped',
  'in_transit',
  'out_for_delivery',
  'delivered',
];

/** States in which the parcel is still moving. */
export const IN_FLIGHT_STATUSES: ShipmentStatus[] = [
  'shipped',
  'in_transit',
  'out_for_delivery',
  'delivery_failed',
];

/** States where the slot is still held (a replacement shipment is refused). */
export const LIVE_SHIPMENT_STATUSES: ShipmentStatus[] = [
  'pending',
  'ready_to_ship',
  'shipped',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
];

/** States that count as a failed delivery for the console summary. */
export const FAILED_DELIVERY_STATUSES: ShipmentStatus[] = [
  'delivery_failed',
  'returned_to_sender',
];

export function canTransitionShipment(
  from: ShipmentStatus,
  to: ShipmentStatus,
): boolean {
  return ALLOWED_SHIPMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalShipment(status: ShipmentStatus): boolean {
  return ALLOWED_SHIPMENT_TRANSITIONS[status]?.length === 0;
}

/** Position on the happy path, or -1 for failure branches. */
export function deliveryProgress(status: ShipmentStatus): number {
  return DELIVERY_FLOW.indexOf(status);
}

/**
 * "Delayed" is time-derived, never a stored status: a parcel is delayed when it
 * promised a date that has passed and has not arrived (or gone back).
 */
export function isDelayed(
  status: ShipmentStatus,
  estimatedDelivery: Date | undefined,
  now = new Date(),
): boolean {
  if (!estimatedDelivery) {
    return false;
  }
  if (status === 'delivered' || status === 'returned_to_sender') {
    return false;
  }

  return estimatedDelivery.getTime() < now.getTime();
}
