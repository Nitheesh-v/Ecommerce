import {
  describeDiscount,
  isUsable,
  offerStatus,
  OFFER_STATUS_LABELS,
  unavailableReason,
} from './offer-status.js';

const now = new Date('2026-11-04T10:00:00.000Z');
const at = (iso: string) => new Date(iso);

const base = {
  isActive: true,
  startsAt: at('2026-11-01T00:00:00.000Z'),
  endsAt: at('2026-11-30T23:59:59.000Z'),
  totalUsageLimit: null as number | null,
  usageCount: 0,
};

describe('offerStatus', () => {
  it('derives the lifecycle from dates instead of a stored flag', () => {
    expect(offerStatus(base, now)).toBe('active');
    expect(
      offerStatus({ ...base, startsAt: at('2026-12-01T00:00:00.000Z') }, now),
    ).toBe('scheduled');
    expect(
      offerStatus({ ...base, endsAt: at('2026-11-02T00:00:00.000Z') }, now),
    ).toBe('expired');
  });

  it('treats the switch and an exhausted counter as terminal', () => {
    expect(offerStatus({ ...base, isActive: false }, now)).toBe('inactive');
    expect(
      offerStatus({ ...base, totalUsageLimit: 10, usageCount: 10 }, now),
    ).toBe('exhausted');
    expect(
      offerStatus({ ...base, totalUsageLimit: 10, usageCount: 9 }, now),
    ).toBe('active');
    // An unlimited offer never exhausts.
    expect(offerStatus({ ...base, usageCount: 10_000 }, now)).toBe('active');
  });

  it('makes the boundaries inclusive and only "active" usable', () => {
    expect(
      offerStatus(
        { ...base, startsAt: now, endsAt: now },
        now,
      ),
    ).toBe('active');
    expect(isUsable('active')).toBe(true);
    for (const status of ['scheduled', 'expired', 'exhausted', 'inactive'] as const) {
      expect(isUsable(status)).toBe(false);
      expect(unavailableReason(status).length).toBeGreaterThan(0);
      expect(OFFER_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it('describes the discount without inventing a currency symbol incorrectly', () => {
    expect(describeDiscount('percentage', 20)).toBe('20% off');
    expect(describeDiscount('percentage', 12.5)).toBe('12.50% off');
    expect(describeDiscount('fixed', 15_000)).toBe('₹150 off');
    expect(describeDiscount('free_shipping', 0)).toBe('Free shipping');
    expect(describeDiscount('fixed', 15_000, 'USD')).toBe('USD 150 off');
  });
});
