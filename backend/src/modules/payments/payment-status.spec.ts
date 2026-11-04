import {
  canTransition,
  isOpen,
  isRefundable,
  isSettled,
  statusAfterRefunds,
} from './payment-status.js';

describe('payment status machine', () => {
  it('allows the normal capture path and nothing that pays an order twice', () => {
    expect(canTransition('pending', 'authorized')).toBe(true);
    expect(canTransition('pending', 'captured')).toBe(true);
    expect(canTransition('authorized', 'captured')).toBe(true);
    expect(canTransition('captured', 'refunded')).toBe(true);
    expect(canTransition('failed', 'captured')).toBe(false);
    expect(canTransition('cancelled', 'captured')).toBe(false);
    expect(canTransition('refunded', 'captured')).toBe(false);
  });

  it('describes which statuses hold money', () => {
    expect(isSettled('captured')).toBe(true);
    expect(isSettled('partially_refunded')).toBe(true);
    expect(isSettled('refunded')).toBe(true);
    expect(isSettled('authorized')).toBe(false);
    expect(isSettled('pending')).toBe(false);

    expect(isOpen('pending')).toBe(true);
    expect(isOpen('authorized')).toBe(true);
    expect(isOpen('failed')).toBe(false);

    expect(isRefundable('captured')).toBe(true);
    expect(isRefundable('partially_refunded')).toBe(true);
    expect(isRefundable('refunded')).toBe(false);
  });

  it('derives the refund status from processed money only', () => {
    expect(statusAfterRefunds('captured', 100_000, 0)).toBe('captured');
    expect(statusAfterRefunds('captured', 100_000, 40_000)).toBe('partially_refunded');
    expect(statusAfterRefunds('partially_refunded', 100_000, 60_000)).toBe('partially_refunded');
    expect(statusAfterRefunds('partially_refunded', 100_000, 100_000)).toBe('refunded');
  });

  it('never invents a refund on an unpaid attempt', () => {
    expect(statusAfterRefunds('pending', 100_000, 10_000)).toBe('pending');
    expect(statusAfterRefunds('failed', 100_000, 10_000)).toBe('failed');
    expect(statusAfterRefunds('cancelled', 100_000, 10_000)).toBe('cancelled');
  });
});
