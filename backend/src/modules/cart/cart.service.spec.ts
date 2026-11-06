// src/modules/cart/cart.service.spec.ts

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { Role } from '../../common/enums/role.enum.js';
import { CartService } from './cart.service.js';
import { CartsRepository } from './repositories/cart.repository.js';
import type { CartItemRecord, CartRecord } from './repositories/cart.repository.js';
import { CouponPricingService } from '../coupons/coupon-pricing.js';
import type { CouponQuote } from '../coupons/coupon-pricing.js';
import { ProductsService } from '../products/products.service.js';
import type { AdminProductView } from '../products/products.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { PricingConfig } from '../orders/pricing.js';

const USER: AuthenticatedUser = {
  id: 'user-1',
  email: 'asha@example.com',
  role: Role.Customer,
};

const PRICING: PricingConfig = {
  currency: 'INR',
  taxRatePercent: 18,
  flatShippingCharge: 4_900,
  freeShippingThreshold: 99_900,
};

/** Cart persistence, in memory, with the same contract as the Mongoose one. */
class FakeCartsRepository implements CartsRepository {
  carts = new Map<string, CartRecord>();
  private counter = 0;

  async findByUser(userId: string): Promise<CartRecord | null> {
    const cart = this.carts.get(userId);

    return cart ? { ...cart, items: cart.items.map((item) => ({ ...item })) } : null;
  }

  async save(
    userId: string,
    items: CartItemRecord[],
    couponCode: string | null,
  ): Promise<CartRecord> {
    this.counter += 1;
    const cart: CartRecord = {
      id: `cart-${this.counter}`,
      userId,
      items: items.map((item) => ({ ...item })),
      couponCode,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    this.carts.set(userId, cart);

    return { ...cart, items: cart.items.map((item) => ({ ...item })) };
  }

  async setCoupon(userId: string, couponCode: string | null): Promise<void> {
    const cart = this.carts.get(userId);

    if (cart) {
      this.carts.set(userId, { ...cart, couponCode });
    }
  }

  async clear(userId: string): Promise<void> {
    this.carts.delete(userId);
  }
}

function product(overrides: Partial<AdminProductView> = {}): AdminProductView {
  return {
    id: 'p1',
    name: 'Steel Kettle',
    slug: 'steel-kettle',
    description: 'A kettle',
    sku: 'KET-1',
    categoryId: 'c1',
    price: 1_20_000,
    salePrice: null,
    costPrice: null,
    stock: 10,
    lowStockThreshold: 2,
    status: 'published',
    isFeatured: false,
    ratingAverage: 0,
    ratingCount: 0,
    images: [{ url: 'https://cdn.example.com/kettle.jpg', isPrimary: true }],
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    category: null,
    stockStatus: 'in_stock',
    effectivePrice: overrides.salePrice ?? overrides.price ?? 1_20_000,
    ...overrides,
  } as AdminProductView;
}

function quote(overrides: Partial<CouponQuote> = {}): CouponQuote {
  return {
    offerId: 'offer-1',
    code: 'SAVE10',
    name: 'Save 10%',
    type: 'percentage',
    value: 10,
    minCartValue: 0,
    maxDiscount: 5_000,
    discount: 5_000,
    freeShipping: false,
    eligibleSubtotal: 1_20_000,
    summary: '10% off up to ₹50',
    ...overrides,
  };
}

describe('CartService', () => {
  let carts: FakeCartsRepository;
  let products: Map<string, AdminProductView>;
  let coupons: { quote: ReturnType<typeof vi.fn> };
  let settings: { pricing: ReturnType<typeof vi.fn> };
  let service: CartService;

  beforeEach(() => {
    carts = new FakeCartsRepository();
    products = new Map([
      ['p1', product()],
      ['p2', product({ id: 'p2', name: 'Copper Mug', slug: 'copper-mug', price: 50_000, stock: 3 })],
    ]);
    coupons = { quote: vi.fn(async () => quote()) };
    settings = { pricing: vi.fn(async () => PRICING) };

    service = new CartService(
      carts,
      {
        getForAdmin: async (id: string) => {
          const found = products.get(id);

          if (!found) {
            throw new NotFoundException('Product not found');
          }

          return found;
        },
      } as unknown as ProductsService,
      coupons as unknown as CouponPricingService,
      settings as unknown as SettingsService,
    );
  });

  // ------------------------------------------------------------------- reads

  it('returns an empty cart with zeroed totals when nothing has been added', async () => {
    const cart = await service.getForUser(USER);

    expect(cart.items).toEqual([]);
    expect(cart.unavailableCount).toBe(0);
    expect(cart.updatedAt).toBeNull();
    expect(cart.totals).toMatchObject({
      itemCount: 0,
      subtotal: 0,
      goodsValue: 0,
      shippingCharge: 0,
      taxAmount: 0,
      total: 0,
      currency: 'INR',
    });
  });

  // --------------------------------------------------------------- mutations

  it('adds a product with a snapshot price and no tax-free surprises', async () => {
    const cart = await service.addItem(USER, { productId: 'p1', quantity: 2 });

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({
      productId: 'p1',
      name: 'Steel Kettle',
      quantity: 2,
      unitPrice: 1_20_000,
      lineTotal: 2_40_000,
      available: true,
    });
    expect(carts.carts.get(USER.id)?.items[0].priceAtAdd).toBe(1_20_000);
    // 2 × ₹1200 = ₹2400: above the free-shipping threshold, so no charge.
    expect(cart.totals).toMatchObject({
      itemCount: 2,
      subtotal: 2_40_000,
      shippingCharge: 0,
      taxAmount: 43_200,
      total: 2_83_200,
    });
  });

  it('increments the quantity when the same product is added again', async () => {
    await service.addItem(USER, { productId: 'p1', quantity: 1 });
    const cart = await service.addItem(USER, { productId: 'p1', quantity: 2 });

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(3);
  });

  it('refuses a product that is not published', async () => {
    products.set('p1', product({ status: 'draft' }));

    await expect(service.addItem(USER, { productId: 'p1', quantity: 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a quantity larger than the stock on hand', async () => {
    await expect(service.addItem(USER, { productId: 'p2', quantity: 4 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses more than 99 units of one product', async () => {
    products.set('p1', product({ stock: 500 }));

    await expect(service.addItem(USER, { productId: 'p1', quantity: 99 })).resolves.toBeDefined();
    await expect(service.addItem(USER, { productId: 'p1', quantity: 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an unknown product id instead of storing it', async () => {
    await expect(
      service.addItem(USER, { productId: 'missing', quantity: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets a quantity and removes the line when it is set to zero', async () => {
    await service.addItem(USER, { productId: 'p1', quantity: 1 });

    const updated = await service.updateItem(USER, 'p1', 3);

    expect(updated.items[0].quantity).toBe(3);

    const removed = await service.updateItem(USER, 'p1', 0);

    expect(removed.items).toEqual([]);
  });

  it('will not update a product that is not in the cart', async () => {
    await expect(service.updateItem(USER, 'p1', 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes one product and reports a missing line', async () => {
    await service.addItem(USER, { productId: 'p1', quantity: 1 });
    await service.addItem(USER, { productId: 'p2', quantity: 1 });

    const cart = await service.removeItem(USER, 'p1');

    expect(cart.items.map((item) => item.productId)).toEqual(['p2']);
    await expect(service.removeItem(USER, 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('empties the cart, coupon included', async () => {
    await service.addItem(USER, { productId: 'p1', quantity: 1 });
    await service.applyCoupon(USER, 'SAVE10');

    const cart = await service.clear(USER);

    expect(cart.items).toEqual([]);
    expect(cart.coupon).toBeNull();
    expect(carts.carts.has(USER.id)).toBe(false);
  });

  // ----------------------------------------------------------------- coupons

  it('applies a coupon and shows the discount it produced', async () => {
    await service.addItem(USER, { productId: 'p1', quantity: 1 });

    const cart = await service.applyCoupon(USER, 'save10');

    expect(coupons.quote).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'save10', userId: USER.id, customerEmail: USER.email }),
    );
    expect(cart.coupon).toMatchObject({ code: 'SAVE10', discount: 5_000 });
    expect(cart.totals.couponDiscount).toBe(5_000);
    // ₹1200 − ₹50 = ₹1150, still at/above the threshold, plus 18% tax = ₹207.
    expect(cart.totals).toMatchObject({
      goodsValue: 1_20_000,
      couponDiscount: 5_000,
      shippingCharge: 0,
      taxAmount: 20_700,
      total: 1_35_700,
    });
  });

  it('rejects a code on an empty cart before asking the coupon service', async () => {
    await expect(service.applyCoupon(USER, 'SAVE10')).rejects.toBeInstanceOf(BadRequestException);
    expect(coupons.quote).not.toHaveBeenCalled();
  });

  it('drops a stored coupon that no longer applies and says why', async () => {
    await service.addItem(USER, { productId: 'p1', quantity: 1 });
    await service.applyCoupon(USER, 'SAVE10');

    coupons.quote.mockRejectedValueOnce(new BadRequestException('This coupon has expired'));

    const cart = await service.getForUser(USER);

    expect(cart.coupon).toBeNull();
    expect(cart.couponIssue).toBe('This coupon has expired');
    expect(carts.carts.get(USER.id)?.couponCode).toBeNull();
    expect(cart.totals.couponDiscount).toBe(0);
  });

  it('removes the coupon on request', async () => {
    await service.addItem(USER, { productId: 'p1', quantity: 1 });
    await service.applyCoupon(USER, 'SAVE10');

    const cart = await service.removeCoupon(USER);

    expect(cart.coupon).toBeNull();
    expect(cart.totals.couponDiscount).toBe(0);
  });

  it('waives shipping when the coupon is a free-shipping offer', async () => {
    await service.addItem(USER, { productId: 'p2', quantity: 1 });
    // Used twice: once to validate the code, once to price the cart it was applied to.
    coupons.quote.mockResolvedValue(
      quote({ code: 'SHIPFREE', type: 'free_shipping', discount: 0, freeShipping: true }),
    );

    const cart = await service.applyCoupon(USER, 'SHIPFREE');

    expect(cart.totals.shippingCharge).toBe(0);
    expect(cart.totals.freeShippingGap).toBe(49_900);
    expect(cart.coupon?.freeShipping).toBe(true);
  });

  it('charges the flat fee below the threshold', async () => {
    const cart = await service.addItem(USER, { productId: 'p2', quantity: 1 });

    // ₹500 of goods, ₹49 shipping, 18% tax on ₹500 = ₹90.
    expect(cart.totals).toMatchObject({
      subtotal: 50_000,
      shippingCharge: 4_900,
      taxAmount: 9_000,
      total: 63_900,
      freeShippingGap: 49_900,
    });
  });

  it('rounds tax to the nearest paisa on odd amounts', async () => {
    products.set('p1', product({ price: 99_950, effectivePrice: 99_950 }));

    const cart = await service.addItem(USER, { productId: 'p1', quantity: 1 });

    // 99950 × 18 / 100 = 17991 exactly; the total stays an integer.
    expect(cart.totals.taxAmount).toBe(17_991);
    expect(cart.totals.total).toBe(1_17_941);
    expect(Number.isInteger(cart.totals.total)).toBe(true);
  });

  it('prices a sale item from the sale price but keeps the list price for the strike-through', async () => {
    products.set('p1', product({ price: 1_20_000, salePrice: 90_000, effectivePrice: 90_000 }));

    const cart = await service.addItem(USER, { productId: 'p1', quantity: 1 });

    expect(cart.totals).toMatchObject({
      subtotal: 1_20_000,
      goodsValue: 90_000,
      discountTotal: 30_000,
    });
  });

  // -------------------------------------------------------------- availability

  it('keeps an out-of-stock line in the cart, flagged and unpriced', async () => {
    await service.addItem(USER, { productId: 'p1', quantity: 1 });
    products.set('p1', product({ stock: 0 }));

    const cart = await service.getForUser(USER);

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({
      available: false,
      unavailableReason: 'Out of stock',
      lineTotal: 0,
    });
    expect(cart.unavailableCount).toBe(1);
    expect(cart.totals.total).toBe(0);
  });

  it('flags a line whose stock has dropped below the stored quantity', async () => {
    products.set('p2', product({ id: 'p2', stock: 5 }));
    await service.addItem(USER, { productId: 'p2', quantity: 4 });
    products.set('p2', product({ id: 'p2', stock: 2 }));

    const cart = await service.getForUser(USER);

    expect(cart.items[0]).toMatchObject({
      available: false,
      unavailableReason: 'Only 2 left in stock',
    });
  });

  it('flags a product that has left the catalogue', async () => {
    await service.addItem(USER, { productId: 'p1', quantity: 1 });
    products.delete('p1');

    const cart = await service.getForUser(USER);

    expect(cart.items[0]).toMatchObject({
      name: 'Unavailable product',
      available: false,
      unavailableReason: 'This product is no longer in the catalogue',
    });
  });

  // ------------------------------------------------------------ checkout view

  it('hands checkout only the buyable lines plus any blocking problems', async () => {
    await service.addItem(USER, { productId: 'p1', quantity: 1 });
    await service.addItem(USER, { productId: 'p2', quantity: 1 });
    products.set('p2', product({ id: 'p2', name: 'Copper Mug', stock: 0 }));

    const snapshot = await service.checkoutSnapshot(USER);

    expect(snapshot.items.map((item) => item.productId)).toEqual(['p1']);
    expect(snapshot.problems).toHaveLength(1);
    expect(snapshot.problems[0]).toContain('Copper Mug');
    expect(snapshot.totals.total).toBe(1_41_600);
  });

  it('reports a coupon issue to checkout instead of pricing a dead discount', async () => {
    await service.addItem(USER, { productId: 'p1', quantity: 1 });
    await service.applyCoupon(USER, 'SAVE10');
    coupons.quote.mockRejectedValueOnce(new BadRequestException('This coupon has expired'));

    const snapshot = await service.checkoutSnapshot(USER);

    expect(snapshot.coupon).toBeNull();
    expect(snapshot.couponIssue).toBe('This coupon has expired');
    expect(snapshot.couponCode).toBeNull();
  });

  it('reports the coupon code checkout should send to the order', async () => {
    await service.addItem(USER, { productId: 'p1', quantity: 1 });
    await service.applyCoupon(USER, 'SAVE10');

    const snapshot = await service.checkoutSnapshot(USER);

    expect(snapshot.couponCode).toBe('SAVE10');
    expect(snapshot.coupon?.discount).toBe(5_000);
  });
});
