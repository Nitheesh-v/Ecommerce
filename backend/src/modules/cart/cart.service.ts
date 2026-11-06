// src/modules/cart/cart.service.ts

import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { CouponPricingService } from '../coupons/coupon-pricing.js';
import type { CouponPricingLine, CouponQuote } from '../coupons/coupon-pricing.js';
import { computeTotals } from '../orders/pricing.js';
import type { PricedLine, PricingConfig, Totals } from '../orders/pricing.js';
import { ProductsService } from '../products/products.service.js';
import type { AdminProductView } from '../products/products.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { CartsRepository } from './repositories/cart.repository.js';
import type { CartItemRecord, CartRecord } from './repositories/cart.repository.js';

/** Hard ceiling per line; stock is usually the binding limit. */
const MAX_QUANTITY = 99;

export interface CartItemView {
  productId: string;
  name: string;
  slug: string | null;
  sku: string | null;
  imageUrl: string | null;
  quantity: number;
  /** Charged price per unit, minor units — live, not the add-time snapshot. */
  unitPrice: number;
  /** List price per unit, minor units (for "was/now"). */
  listPrice: number;
  lineTotal: number;
  /** `stock` from the product record, which the inventory ledger owns. */
  stock: number;
  available: boolean;
  unavailableReason: string | null;
}

export interface CartTotalsView {
  itemCount: number;
  /** List-price value before any discount (sale or coupon). */
  subtotal: number;
  /** What the customer pays for the goods before a coupon. */
  goodsValue: number;
  discountTotal: number;
  couponDiscount: number;
  shippingCharge: number;
  taxAmount: number;
  taxRatePercent: number;
  total: number;
  currency: string;
  freeShippingThreshold: number;
  /** Spend still needed to reach free shipping, minor units (`0` once reached). */
  freeShippingGap: number;
}

export interface AppliedCouponView {
  code: string;
  name: string;
  type: CouponQuote['type'];
  summary: string;
  discount: number;
  freeShipping: boolean;
}

export interface CartView {
  items: CartItemView[];
  totals: CartTotalsView;
  coupon: AppliedCouponView | null;
  /** Why a stored coupon stopped applying (it is dropped rather than shown stale). */
  couponIssue: string | null;
  /** Items that can no longer be bought; they are shown but not priced. */
  unavailableCount: number;
  updatedAt: string | null;
}

/** A line checkout can price — buyable at the moment it was read. */
export interface CheckoutCartLine {
  productId: string;
  name: string;
  slug: string | null;
  sku: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  listPrice: number;
  lineTotal: number;
}

/**
 * Everything checkout needs from the cart, with the un-buyable lines called out
 * rather than swallowed.
 */
export interface CheckoutCartSnapshot {
  items: CheckoutCartLine[];
  totals: CartTotalsView;
  coupon: AppliedCouponView | null;
  couponCode: string | null;
  couponIssue: string | null;
  /** One entry per line that cannot be bought, already phrased for the customer. */
  problems: string[];
}

/**
 * The server-side cart.
 *
 * Three rules shape everything here:
 *
 * 1. **The cart is a wish list of product ids and quantities.** Prices live on the
 *    product record; `priceAtAdd` is display-only history.
 * 2. **Totals are computed with `computeTotals`** — the exact function the order
 *    uses — so the number a customer sees in the cart is the number checkout will
 *    charge, including sale prices, coupon discounts, tax and shipping.
 * 3. **A coupon is re-priced on every read.** If it expired, ran out, or the cart
 *    dropped below its minimum, it is removed with an explanation instead of
 *    lingering as a discount that will fail at the last step.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly carts: CartsRepository,
    // Pricing source of truth for products — the same read the order uses.
    private readonly productsService: ProductsService,
    private readonly coupons: CouponPricingService,
    private readonly settings: SettingsService,
  ) {}

  // ------------------------------------------------------------------ reads

  async getForUser(user: AuthenticatedUser): Promise<CartView> {
    return this.buildView(user, await this.carts.findByUser(user.id));
  }

  // ---------------------------------------------------------------- mutations

  async addItem(
    user: AuthenticatedUser,
    input: { productId: string; quantity: number },
  ): Promise<CartView> {
    const record = await this.carts.findByUser(user.id);
    const product = await this.requirePurchasable(input.productId);
    const existing = record?.items.find((item) => item.productId === product.id);
    const quantity = (existing?.quantity ?? 0) + input.quantity;

    this.assertQuantity(product, quantity);

    const items = existing
      ? (record as CartRecord).items.map((item) =>
          item.productId === product.id ? { ...item, quantity } : item,
        )
      : [
          ...(record?.items ?? []),
          {
            productId: product.id,
            quantity,
            priceAtAdd: product.effectivePrice,
            addedAt: new Date(),
          },
        ];

    const saved = await this.carts.save(user.id, items, record?.couponCode ?? null);

    return this.buildView(user, saved);
  }

  async updateItem(
    user: AuthenticatedUser,
    productId: string,
    quantity: number,
  ): Promise<CartView> {
    const record = await this.carts.findByUser(user.id);
    const existing = record?.items.find((item) => item.productId === productId);

    if (!record || !existing) {
      throw new NotFoundException('That product is not in your cart');
    }

    // Zero is a removal, not a validation error: the quantity stepper's "minus"
    // at one unit means exactly that.
    if (quantity === 0) {
      return this.removeItem(user, productId);
    }

    const product = await this.requirePurchasable(productId);
    this.assertQuantity(product, quantity);

    const saved = await this.carts.save(
      user.id,
      record.items.map((item) => (item.productId === productId ? { ...item, quantity } : item)),
      record.couponCode,
    );

    return this.buildView(user, saved);
  }

  async removeItem(user: AuthenticatedUser, productId: string): Promise<CartView> {
    const record = await this.carts.findByUser(user.id);
    const items = record?.items.filter((item) => item.productId !== productId) ?? [];

    if (!record || items.length === record.items.length) {
      throw new NotFoundException('That product is not in your cart');
    }

    const saved = await this.carts.save(user.id, items, record.couponCode);

    return this.buildView(user, saved);
  }

  async clear(user: AuthenticatedUser): Promise<CartView> {
    await this.carts.clear(user.id);

    return this.buildView(user, null);
  }

  // ----------------------------------------------------------------- coupons

  async applyCoupon(user: AuthenticatedUser, code: string): Promise<CartView> {
    const record = await this.carts.findByUser(user.id);
    const buyable = (record?.items ?? []).length > 0 ? await this.buyableLines(record) : [];

    if (buyable.length === 0) {
      throw new BadRequestException('Add a product to your cart before applying a coupon');
    }

    // Validate *now*, against the live cart: storing an invalid code and only
    // failing at checkout would be a trap.
    const quote = await this.coupons.quote({
      code,
      lines: buyable,
      userId: user.id,
      customerEmail: user.email,
    });

    const saved = await this.carts.save(
      user.id,
      record?.items ?? [],
      quote.code.toUpperCase(),
    );

    return this.buildView(user, saved);
  }

  async removeCoupon(user: AuthenticatedUser): Promise<CartView> {
    await this.carts.setCoupon(user.id, null);

    return this.getForUser(user);
  }

  // ------------------------------------------------------------- checkout side

  /**
   * What checkout needs — and nothing about presentation.
   *
   * It is the same computation the cart page shows, so the number a customer saw a
   * second ago cannot change shape at the last step, and the problems are collected
   * instead of thrown: checkout decides how to report them (409, naming the items).
   */
  async checkoutSnapshot(user: AuthenticatedUser): Promise<CheckoutCartSnapshot> {
    const assembled = await this.assemble(user, await this.carts.findByUser(user.id));
    const problems: string[] = [];

    for (const row of assembled.rows) {
      if (row.reason) {
        const label = row.product ? `"${row.product.name}"` : 'A product in your cart';
        problems.push(`${label}: ${row.reason.toLowerCase()}`);
      }
    }

    return {
      items: assembled.items
        .filter((item) => item.available)
        .map((item) => ({
          productId: item.productId,
          name: item.name,
          slug: item.slug,
          sku: item.sku,
          imageUrl: item.imageUrl,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          listPrice: item.listPrice,
          lineTotal: item.lineTotal,
        })),
      totals: assembled.totalsView,
      coupon: assembled.coupon ? this.toCouponView(assembled.coupon, assembled.totalsView) : null,
      couponCode: assembled.coupon?.code ?? null,
      couponIssue: assembled.couponIssue,
      problems,
    };
  }

  /** Called once an order exists — an order and a cart must never both hold stock. */
  async clearAfterOrder(userId: string): Promise<void> {
    await this.carts.clear(userId);
  }

  /** Coupon-shaped view of the lines that can actually be bought right now. */
  private async buyableLines(record: CartRecord | null): Promise<CouponPricingLine[]> {
    const lines: CouponPricingLine[] = [];

    for (const item of record?.items ?? []) {
      const product = await this.safeGetProduct(item.productId);

      if (!product || unavailableReason(product, item.quantity) !== null) {
        continue;
      }

      lines.push({
        productId: product.id,
        categoryId: product.categoryId ? String(product.categoryId) : null,
        unitPrice: product.effectivePrice,
        quantity: item.quantity,
      });
    }

    return lines;
  }

  // ------------------------------------------------------------------ pricing

  /**
   * One pass over the stored cart: resolve every product, decide what can still be
   * bought, price the coupon against the buyable subset, and compute totals.
   *
   * Both the cart page and checkout read this, which is the point: the two screens
   * cannot disagree about a price.
   */
  private async assemble(
    user: AuthenticatedUser,
    record: CartRecord | null,
  ): Promise<{
    rows: Array<{ record: CartItemRecord; product: AdminProductView | null; reason: string | null }>;
    items: CartItemView[];
    totalsView: CartTotalsView;
    coupon: CouponQuote | null;
    couponIssue: string | null;
  }> {
    const pricing = await this.settings.pricing();
    const rows: Array<{
      record: CartItemRecord;
      product: AdminProductView | null;
      reason: string | null;
    }> = [];
    const items: CartItemView[] = [];
    const pricedLines: PricedLine[] = [];
    const couponLines: CouponPricingLine[] = [];

    for (const item of record?.items ?? []) {
      const product = await this.safeGetProduct(item.productId);
      const reason = unavailableReason(product, item.quantity);

      rows.push({ record: item, product, reason });

      items.push({
        productId: item.productId,
        name: product?.name ?? 'Unavailable product',
        slug: product?.slug ?? null,
        sku: product?.sku ?? null,
        imageUrl: product?.images[0]?.url ?? null,
        quantity: item.quantity,
        // A missing product has no price; it is excluded from the totals anyway.
        unitPrice: product?.effectivePrice ?? 0,
        listPrice: product?.price ?? 0,
        lineTotal: reason ? 0 : (product?.effectivePrice ?? 0) * item.quantity,
        stock: product?.stock ?? 0,
        available: reason === null,
        unavailableReason: reason,
      });

      if (reason === null && product) {
        pricedLines.push({
          unitPrice: product.effectivePrice,
          listPrice: product.price,
          quantity: item.quantity,
        });
        couponLines.push({
          productId: product.id,
          categoryId: product.categoryId ? String(product.categoryId) : null,
          unitPrice: product.effectivePrice,
          quantity: item.quantity,
        });
      }
    }

    const { coupon, issue } = await this.resolveCoupon(user, record, couponLines);
    const totals = computeTotals(pricedLines, pricing, coupon?.discount ?? 0, {
      freeShipping: coupon?.freeShipping ?? false,
    });

    return {
      rows,
      items,
      totalsView: this.toTotalsView(totals, pricedLines, pricing),
      coupon,
      couponIssue: issue,
    };
  }

  private async buildView(user: AuthenticatedUser, record: CartRecord | null): Promise<CartView> {
    const assembled = await this.assemble(user, record);

    return {
      items: assembled.items,
      totals: assembled.totalsView,
      coupon: assembled.coupon
        ? this.toCouponView(assembled.coupon, assembled.totalsView)
        : null,
      couponIssue: assembled.couponIssue,
      unavailableCount: assembled.rows.filter((row) => row.reason !== null).length,
      updatedAt: record?.updatedAt.toISOString() ?? null,
    };
  }

  private toCouponView(coupon: CouponQuote, totals: CartTotalsView): AppliedCouponView {
    return {
      code: coupon.code,
      name: coupon.name,
      type: coupon.type,
      summary: coupon.summary,
      discount: totals.couponDiscount,
      freeShipping: coupon.freeShipping,
    };
  }

  private toTotalsView(
    totals: Totals,
    lines: PricedLine[],
    pricing: PricingConfig,
  ): CartTotalsView {
    const goodsValue = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const discountedGoods = Math.max(0, goodsValue - totals.couponDiscount);

    return {
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotal: totals.subtotal,
      goodsValue,
      discountTotal: totals.discountTotal,
      couponDiscount: totals.couponDiscount,
      shippingCharge: totals.shippingCharge,
      taxAmount: totals.taxAmount,
      taxRatePercent: totals.taxRatePercent,
      total: totals.total,
      currency: pricing.currency,
      freeShippingThreshold: pricing.freeShippingThreshold,
      freeShippingGap: Math.max(0, pricing.freeShippingThreshold - discountedGoods),
    };
  }

  /**
   * Re-prices the stored code against the current cart.
   *
   * A code that no longer applies is removed from the cart and reported once, so
   * the customer sees "Coupon X is no longer valid" instead of a discount that
   * silently disappears at checkout.
   */
  private async resolveCoupon(
    user: AuthenticatedUser,
    record: CartRecord | null,
    lines: CouponPricingLine[],
  ): Promise<{ coupon: CouponQuote | null; issue: string | null }> {
    const code = record?.couponCode;

    if (!code || lines.length === 0) {
      return { coupon: null, issue: null };
    }

    try {
      const coupon = await this.coupons.quote({
        code,
        lines,
        userId: user.id,
        customerEmail: user.email,
      });

      return { coupon, issue: null };
    } catch (error) {
      await this.carts.setCoupon(user.id, null).catch(() => undefined);

      return { coupon: null, issue: messageOf(error) };
    }
  }


  // ------------------------------------------------------------------ helpers

  private async safeGetProduct(productId: string): Promise<AdminProductView | null> {
    try {
      return await this.productsService.getForAdmin(productId);
    } catch {
      return null;
    }
  }

  private async requirePurchasable(productId: string): Promise<AdminProductView> {
    const product = await this.safeGetProduct(productId);

    if (!product) {
      throw new BadRequestException('That product does not exist');
    }

    const reason = unavailableReason(product, 1);

    if (product.status !== 'published') {
      throw new BadRequestException(`"${product.name}" is no longer available`);
    }
    if (reason) {
      throw new ConflictException(reason);
    }

    return product;
  }

  private assertQuantity(product: AdminProductView, quantity: number): void {
    if (quantity > MAX_QUANTITY) {
      throw new BadRequestException(
        `You can order at most ${MAX_QUANTITY} units of "${product.name}"`,
      );
    }
    if (quantity > product.stock) {
      throw new ConflictException(
        `Only ${product.stock} unit(s) of "${product.name}" are available`,
      );
    }
  }
}

/** `null` when the line can be bought; otherwise a customer-facing reason. */
function unavailableReason(
  product: AdminProductView | null,
  quantity: number,
): string | null {
  if (!product) {
    return 'This product is no longer in the catalogue';
  }
  if (product.status !== 'published') {
    return 'This product is no longer available';
  }
  if (product.stock <= 0) {
    return 'Out of stock';
  }
  if (product.stock < quantity) {
    return `Only ${product.stock} left in stock`;
  }

  return null;
}

/** Nest's exception response can be a string or `{ message }`; both are safe here. */
function messageOf(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();

    if (typeof response === 'string') {
      return response;
    }
    if (typeof response === 'object' && response !== null) {
      const message = (response as { message?: unknown }).message;

      if (typeof message === 'string') {
        return message;
      }
      if (Array.isArray(message) && typeof message[0] === 'string') {
        return message[0];
      }
    }
  }

  return 'This coupon can no longer be applied';
}
