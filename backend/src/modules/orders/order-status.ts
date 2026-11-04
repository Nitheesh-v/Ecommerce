import type { OrderStatus } from './schemas/order.schema.js';

/**
 * The order state machine — the only authority on what may follow what.
 *
 * Deliberately linear: an order can be cancelled only **before** it ships (after
 * that the physical parcel exists and must go through a return), and a return can
 * only be requested after delivery. `return_requested → delivered` is the
 * "request rejected" path that puts the order back to its real state.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: ['return_requested'],
  return_requested: ['returned', 'delivered'],
  cancelled: [],
  returned: [],
};

/** Statuses where a cancellation is still possible (nothing has shipped). */
export const CANCELLABLE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'processing'];

/** Only a delivered order may be returned. */
export const RETURNABLE_STATUSES: OrderStatus[] = ['delivered'];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  return_requested: 'Return requested',
  returned: 'Returned',
};

/** Human-facing order of the happy path, used to render the timeline. */
export const FULFILMENT_FLOW: OrderStatus[] = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canCancel(status: OrderStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status);
}

export function canRequestReturn(status: OrderStatus): boolean {
  return RETURNABLE_STATUSES.includes(status);
}

/** e.g. `Processing → Shipped`, used in 409 error messages. */
export function describeTransition(from: OrderStatus, to: OrderStatus): string {
  return `${ORDER_STATUS_LABELS[from]} → ${ORDER_STATUS_LABELS[to]}`;
}
