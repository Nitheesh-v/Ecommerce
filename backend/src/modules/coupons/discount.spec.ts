import { describeIneligibility, discountFor, evaluateOffer } from './discount.js';
import type { CouponLine, OfferRule } from './discount.js';

const line = (
  productId: string,
  unitPrice: number,
  quantity = 1,
  categoryId: string | null = null,
): CouponLine => ({ productId, unitPrice, quantity, categoryId });

const rule = (overrides: Partial<OfferRule> = {}): OfferRule => ({
  type: 'percentage',
  value: 20,
  minCartValue: 0,
  maxDiscount: null,
  applicableProductIds: [],
  applicableCategoryIds: [],
  excludedProductIds: [],
  excludedCategoryIds: [],
  ...overrides,
});

describe('evaluateOffer', () => {
  it('takes a percentage of the cart and floors the result', () => {
    const evaluation = evaluateOffer(rule({ value: 15 }), [line('p1', 49_999, 2)]);

    expect(evaluation.eligibleSubtotal).toBe(99_998);
    expect(evaluation.discount).toBe(14_999); // 14 999.7 floored
    expect(evaluation.reason).toBeNull();
    expect(evaluation.freeShipping).toBe(false);
  });

  it('caps a percentage offer at maxDiscount', () => {
    const evaluation = evaluateOffer(rule({ value: 50, maxDiscount: 10_000 }), [
      line('p1', 100_000),
    ]);

    expect(evaluation.discount).toBe(10_000);
  });

  it('never discounts more than the eligible goods value', () => {
    const fixed = evaluateOffer(rule({ type: 'fixed', value: 500_000 }), [
      line('p1', 90_000),
    ]);

    expect(fixed.discount).toBe(90_000);
    expect(discountFor(rule({ type: 'fixed', value: 1 }), 0)).toBe(0);
  });

  it('marks a free-shipping offer without a goods discount', () => {
    const evaluation = evaluateOffer(rule({ type: 'free_shipping', value: 0 }), [
      line('p1', 50_000),
    ]);

    expect(evaluation.discount).toBe(0);
    expect(evaluation.freeShipping).toBe(true);
  });

  it('enforces the minimum cart value against eligible goods only', () => {
    const offer = rule({ value: 10, minCartValue: 100_000 });
    const below = evaluateOffer(offer, [line('p1', 60_000)]);

    expect(below.reason).toBe('below_minimum');
    expect(below.discount).toBe(0);
    expect(below.shortfall).toBe(40_000);
    expect(describeIneligibility(below, { type: 'percentage', minCartValue: 100_000 })).toContain(
      '₹400',
    );

    const met = evaluateOffer(offer, [line('p1', 100_000)]);

    expect(met.reason).toBeNull();
    expect(met.discount).toBe(10_000);
  });

  it('applies only to the products and categories the offer names', () => {
    const offer = rule({
      value: 10,
      applicableProductIds: ['p1'],
      applicableCategoryIds: ['c1'],
    });

    const evaluation = evaluateOffer(offer, [
      line('p1', 10_000),
      line('p2', 20_000, 1, 'c1'),
      line('p3', 30_000, 1, 'c2'),
    ]);

    // p1 (listed product) + p2 (listed category); p3 is untouched.
    expect(evaluation.eligibleSubtotal).toBe(30_000);
    expect(evaluation.discount).toBe(3_000);
  });

  it('lets an exclusion beat an inclusion', () => {
    const offer = rule({
      value: 10,
      applicableCategoryIds: ['c1'],
      excludedProductIds: ['p2'],
      excludedCategoryIds: ['c2'],
    });

    const evaluation = evaluateOffer(offer, [
      line('p1', 10_000, 1, 'c1'),
      line('p2', 20_000, 1, 'c1'),
      line('p3', 30_000, 1, 'c2'),
    ]);

    expect(evaluation.eligibleSubtotal).toBe(10_000);
    expect(evaluation.discount).toBe(1_000);
  });

  it('refuses a cart with nothing eligible', () => {
    const evaluation = evaluateOffer(
      rule({ applicableProductIds: ['other'] }),
      [line('p1', 10_000)],
    );

    expect(evaluation.reason).toBe('no_eligible_items');
    expect(evaluation.discount).toBe(0);
    expect(
      describeIneligibility(evaluation, { type: 'percentage', minCartValue: 0 }),
    ).toContain('does not apply');
  });
});
