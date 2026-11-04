import {
  ALLOWED_SHIPMENT_TRANSITIONS,
  canTransitionShipment,
  DELIVERY_FLOW,
  deliveryProgress,
  isDelayed,
  isTerminalShipment,
  SHIPMENT_STATUS_LABELS,
} from './shipment-status.js';
import { SHIPMENT_STATUSES } from './schemas/shipment.schema.js';

describe('shipment status machine', () => {
  it('walks one step at a time along the happy path', () => {
    for (let index = 0; index < DELIVERY_FLOW.length - 1; index += 1) {
      expect(canTransitionShipment(DELIVERY_FLOW[index], DELIVERY_FLOW[index + 1])).toBe(
        true,
      );
    }

    // No skipping ahead: a parcel is never "delivered" straight from pending.
    expect(canTransitionShipment('pending', 'delivered')).toBe(false);
    expect(canTransitionShipment('pending', 'shipped')).toBe(false);
    expect(canTransitionShipment('ready_to_ship', 'in_transit')).toBe(false);
    expect(canTransitionShipment('delivered', 'in_transit')).toBe(false);
  });

  it('keeps the failure branch reachable while the parcel is in flight', () => {
    expect(canTransitionShipment('in_transit', 'delivery_failed')).toBe(true);
    expect(canTransitionShipment('out_for_delivery', 'delivery_failed')).toBe(true);
    expect(canTransitionShipment('delivery_failed', 'out_for_delivery')).toBe(true);
    expect(canTransitionShipment('delivery_failed', 'delivered')).toBe(true);
    expect(canTransitionShipment('delivery_failed', 'returned_to_sender')).toBe(true);
    // A returned parcel never becomes delivered later.
    expect(canTransitionShipment('returned_to_sender', 'delivered')).toBe(false);
  });

  it('marks delivered and returned_to_sender as terminal', () => {
    expect(isTerminalShipment('delivered')).toBe(true);
    expect(isTerminalShipment('returned_to_sender')).toBe(true);
    expect(isTerminalShipment('pending')).toBe(false);
    expect(isTerminalShipment('delivery_failed')).toBe(false);
  });

  it('only points at statuses that exist and labels every one of them', () => {
    const known = new Set(SHIPMENT_STATUSES);

    for (const [from, targets] of Object.entries(ALLOWED_SHIPMENT_TRANSITIONS)) {
      expect(known.has(from as never)).toBe(true);
      for (const target of targets) {
        expect(known.has(target)).toBe(true);
      }
    }

    for (const status of SHIPMENT_STATUSES) {
      expect(SHIPMENT_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it('places the happy path in order and keeps failures off it', () => {
    expect(deliveryProgress('pending')).toBe(0);
    expect(deliveryProgress('out_for_delivery')).toBe(4);
    expect(deliveryProgress('delivered')).toBe(5);
    expect(deliveryProgress('delivery_failed')).toBe(-1);
    expect(deliveryProgress('returned_to_sender')).toBe(-1);
  });

  it('derives "delayed" from the promised date, never from a stored flag', () => {
    const now = new Date('2026-02-10T12:00:00.000Z');
    const yesterday = new Date('2026-02-09T12:00:00.000Z');
    const tomorrow = new Date('2026-02-11T12:00:00.000Z');

    expect(isDelayed('in_transit', yesterday, now)).toBe(true);
    expect(isDelayed('in_transit', tomorrow, now)).toBe(false);
    expect(isDelayed('in_transit', undefined, now)).toBe(false);
    // Arrived or gone back: no longer late, whatever the old promise said.
    expect(isDelayed('delivered', yesterday, now)).toBe(false);
    expect(isDelayed('returned_to_sender', yesterday, now)).toBe(false);
  });
});
