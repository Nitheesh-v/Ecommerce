// src/modules/checkout/checkout.service.ts

import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { AddressesService } from '../addresses/addresses.service.js';
import type { AddressRecord } from '../addresses/repositories/addresses.repository.js';
import { CartService } from '../cart/cart.service.js';
import type {
  AppliedCouponView,
  CartTotalsView,
  CheckoutCartLine,
} from '../cart/cart.service.js';
import { OrdersService } from '../orders/orders.service.js';
import type { ShippingAddressDto } from '../orders/dto/create-order.dto.js';
import type { PaymentMethod, ShippingMethod } from '../orders/schemas/order.schema.js';
import { PaymentsService } from '../payments/payments.service.js';
import type { CheckoutSessionView } from '../payments/payments.service.js';
import type { VerifyPaymentDto } from '../payments/dto/payment-actions.dto.js';
import { SettingsService } from '../settings/settings.service.js';
import type {
  CheckoutPaymentMethod,
  CheckoutPreviewDto,
  PlaceOrderDto,
} from './dto/checkout.dto.js';

/** Delivery estimate offered at checkout: five working days, weekends skipped. */
const DELIVERY_WORKING_DAYS = 5;

export interface CheckoutAddressView {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface CheckoutPaymentOptionsView {
  /** Cash on delivery is switched on by the operator. */
  codAvailable: boolean;
  /** `0` means no cap; otherwise the highest total COD will accept, minor units. */
  codMaxAmount: number;
  /** The gateway is configured and enabled. */
  onlineAvailable: boolean;
  currency: string;
}

/**
 * Everything the review step shows — and nothing that has been written.
 *
 * Note what is missing: no stock is reserved, no coupon redemption is spent and no
 * order row exists. A preview must be free to abandon.
 */
export interface CheckoutPreviewView {
  items: CheckoutCartLine[];
  totals: CartTotalsView;
  coupon: AppliedCouponView | null;
  address: CheckoutAddressView;
  paymentMethod: CheckoutPaymentMethod;
  paymentOptions: CheckoutPaymentOptionsView;
  shippingMethod: ShippingMethod;
  /** ISO date the parcel should arrive by. */
  estimatedDelivery: string;
}

/** The gateway hand-off the checkout page needs to open the payment sheet. */
export interface CheckoutPaymentView {
  gatewayOrderId: string;
  amount: number;
  currency: string;
  keyId: string | null;
  testMode: boolean;
  prefill: CheckoutSessionView['prefill'];
}

export interface PlaceOrderView {
  orderId: string;
  orderNumber: string;
  paymentMethod: CheckoutPaymentMethod;
  /** Order status right after placing (`confirmed` for COD, `pending` for online). */
  status: string;
  paymentStatus: string;
  /** `true` when the customer still has to pay — the UI opens the sheet. */
  requiresPayment: boolean;
  /** Where to send the browser when no sheet is needed (the order page). */
  paymentUrl: string | null;
  totals: {
    subtotal: number;
    couponDiscount: number;
    discountTotal: number;
    taxAmount: number;
    shippingCharge: number;
    total: number;
    currency: string;
  };
  payment: CheckoutPaymentView | null;
  /** `false` when an idempotent retry returned an order that already existed. */
  created: boolean;
}

export interface PaymentConfirmationView {
  verified: boolean;
  orderId: string;
  orderNumber: string;
  paymentStatus: string;
  statusLabel: string;
  orderStatus: string | null;
  total: number;
  currency: string;
}

/**
 * Checkout: preview, place, and confirm the payment.
 *
 * It owns **no persistence of its own**. The cart already knows what is buyable and
 * what it costs; orders already knows how to reserve stock, spend a coupon and write
 * the order; payments already knows how to talk to the gateway. Checkout is the
 * policy layer that decides what may happen, in what order, and what the customer is
 * told when it may not:
 *
 * 1. **Nothing is trusted from the client** — no totals, no prices, no coupon
 *    amounts. Only an address id, a payment *intent* and an optional note arrive.
 * 2. **The money is the cart's number**, computed by the same `computeTotals()` the
 *    order uses, so preview and charge cannot drift.
 * 3. **Cash on delivery is an operator policy** — switched off upstream, or capped by
 *    an amount, and enforced here rather than in the browser.
 * 4. **A failed step never leaves debris**: the order module releases its own
 *    reservations, and the cart is only cleared once an order actually exists.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly cart: CartService,
    private readonly addresses: AddressesService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly settings: SettingsService,
  ) {}

  // ------------------------------------------------------------------ preview

  async preview(
    user: AuthenticatedUser,
    dto: CheckoutPreviewDto,
  ): Promise<CheckoutPreviewView> {
    const address = await this.addresses.requireOwned(user.id, dto.addressId);
    const snapshot = await this.cart.checkoutSnapshot(user);

    this.assertBuyable(snapshot);
    await this.assertPaymentAllowed(dto.paymentMethod, snapshot.totals.total);

    const [policy, gateway] = await Promise.all([
      this.settings.codPolicy(),
      Promise.resolve(this.payments.checkoutConfig()),
    ]);

    return {
      items: snapshot.items,
      totals: snapshot.totals,
      coupon: snapshot.coupon,
      address: toAddressView(address),
      paymentMethod: dto.paymentMethod,
      paymentOptions: {
        codAvailable: policy.enabled,
        codMaxAmount: policy.maxAmount,
        onlineAvailable: gateway.enabled,
        currency: policy.currency,
      },
      shippingMethod: 'standard',
      estimatedDelivery: estimateDelivery(new Date()).toISOString(),
    };
  }

  // ------------------------------------------------------------------- place

  async place(user: AuthenticatedUser, dto: PlaceOrderDto): Promise<PlaceOrderView> {
    const address = await this.addresses.requireOwned(user.id, dto.addressId);
    const snapshot = await this.cart.checkoutSnapshot(user);

    this.assertBuyable(snapshot);
    await this.assertPaymentAllowed(dto.paymentMethod, snapshot.totals.total);

    // The one and only write. Stock reservation, coupon redemption and the order
    // document are the orders module's transaction; if any part fails it undoes the
    // parts it already did, and we never reach the cart-clearing step below.
    const result = await this.orders.createForCustomer(user, {
      items: snapshot.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      shippingAddress: toShippingAddress(address),
      paymentMethod: toOrderPaymentMethod(dto.paymentMethod),
      shippingMethod: 'standard',
      ...(snapshot.couponCode ? { couponCode: snapshot.couponCode } : {}),
      ...(dto.customerNote?.trim() ? { customerNote: dto.customerNote.trim() } : {}),
      ...(dto.idempotencyKey ? { idempotencyKey: dto.idempotencyKey } : {}),
    });

    // COD has nothing to wait for, so the order is accepted straight away. An online
    // order stays `pending` until its payment verifies (see `confirmPayment`).
    const order =
      dto.paymentMethod === 'cod'
        ? await this.orders.confirmPlacement(result.order.id, user)
        : result.order;

    // Clear the cart only for a genuinely new order: on an idempotent replay the
    // cart may already hold the customer's next purchase.
    if (result.created) {
      await this.cart.clearAfterOrder(user.id).catch((error: unknown) => {
        // The order stands; a stale cart line is recoverable, a lost order is not.
        this.logger.warn(
          `Order ${result.order.orderNumber} was created but the cart could not be cleared: ${String(error)}`,
        );
      });
    }

    const payment =
      dto.paymentMethod === 'online' ? await this.startPayment(user, order.id) : null;

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentMethod: dto.paymentMethod,
      status: order.status,
      paymentStatus: order.paymentStatus,
      requiresPayment: payment !== null,
      paymentUrl: `/account/orders/${order.id}`,
      totals: {
        subtotal: snapshot.totals.subtotal,
        couponDiscount: snapshot.totals.couponDiscount,
        discountTotal: snapshot.totals.discountTotal,
        taxAmount: snapshot.totals.taxAmount,
        shippingCharge: snapshot.totals.shippingCharge,
        total: snapshot.totals.total,
        currency: snapshot.totals.currency,
      },
      payment,
      created: result.created,
    };
  }

  // --------------------------------------------------------- payment callback

  /**
   * Confirms a gateway payment.
   *
   * The verification itself — signature, the re-read from the gateway, and applying
   * the capture to the order — belongs to `PaymentsService`. Checkout only translates
   * the outcome into the short view the success page needs, and turns "the signature
   * did not verify" into **422**, because the request was well-formed and the server
   * said no.
   */
  async confirmPayment(
    user: AuthenticatedUser,
    dto: VerifyPaymentDto,
  ): Promise<PaymentConfirmationView> {
    try {
      const result = await this.payments.verifyPayment(user, dto);
      // A paid order has nothing left to wait for; confirming it here means the
      // success page (and the order page) never show a paid order as `pending`.
      const orderStatus = await this.confirmAfterPayment(
        user,
        result.payment.orderId,
        result.order?.status ?? null,
      );

      return {
        verified: result.verified,
        orderId: result.payment.orderId,
        orderNumber: result.payment.orderNumber,
        paymentStatus: result.payment.status,
        statusLabel: result.statusLabel,
        orderStatus,
        total: result.payment.amount,
        currency: result.payment.currency,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new UnprocessableEntityException(messageOf(error));
      }

      throw error;
    }
  }

  // ------------------------------------------------------------------ helpers

  /** An empty cart, or a line that can no longer be bought, is a refusal, not a sale. */
  private assertBuyable(snapshot: {
    items: CheckoutCartLine[];
    problems: string[];
    couponIssue: string | null;
  }): void {
    if (snapshot.problems.length > 0) {
      throw new ConflictException(
        `Some items are no longer available: ${snapshot.problems.join('; ')}`,
      );
    }
    if (snapshot.items.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }
    if (snapshot.couponIssue) {
      throw new ConflictException(
        `${snapshot.couponIssue} — it has been removed from your cart, so review the total and try again.`,
      );
    }
  }

  private async assertPaymentAllowed(
    method: CheckoutPaymentMethod,
    total: number,
  ): Promise<void> {
    if (method === 'cod') {
      const policy = await this.settings.codPolicy();

      if (!policy.enabled) {
        throw new ConflictException(
          'Cash on delivery is currently unavailable — please pay online',
        );
      }
      if (policy.maxAmount > 0 && total > policy.maxAmount) {
        throw new ConflictException(
          `Cash on delivery is available on orders up to ${this.formatMoney(
            policy.maxAmount,
            policy.currency,
          )}. Please pay online for this order.`,
        );
      }

      return;
    }

    if (!this.payments.checkoutConfig().enabled) {
      throw new ConflictException(
        'Online payment is temporarily unavailable — please choose cash on delivery',
      );
    }
  }

  /**
   * Starts the gateway attempt **after** the order exists, so the amount is the
   * order's stored total rather than anything the browser said.
   *
   * If the gateway refuses to open an attempt the order still stands — it is payable
   * from the customer's order page — so the error says exactly that instead of
   * pretending the whole checkout failed.
   */
  private async startPayment(
    user: AuthenticatedUser,
    orderId: string,
  ): Promise<CheckoutPaymentView | null> {
    try {
      const session = await this.payments.createPaymentOrder(user, { orderId });

      return {
        gatewayOrderId: session.gatewayOrderId,
        amount: session.amount,
        currency: session.currency,
        keyId: session.keyId,
        testMode: session.testMode,
        prefill: session.prefill,
      };
    } catch (error) {
      this.logger.error(
        `Order ${orderId} was created but the payment attempt could not be started: ${String(error)}`,
      );

      throw new ServiceUnavailableException(
        'Your order was created, but we could not start the payment. Open it from “My orders” to pay.',
      );
    }
  }

  /**
   * Confirms the order after a verified capture.
   *
   * The money is already recorded at this point, so a failure here must not turn a
   * successful payment into an error page: it is logged, and the order stays
   * `pending` for the operator to confirm — recoverable, unlike telling the customer
   * their payment failed.
   */
  private async confirmAfterPayment(
    user: AuthenticatedUser,
    orderId: string,
    fallbackStatus: string | null,
  ): Promise<string | null> {
    try {
      const order = await this.orders.confirmPlacement(orderId, user);

      return order.status;
    } catch (error) {
      this.logger.warn(
        `Payment for order ${orderId} verified but the order could not be confirmed: ${String(error)}`,
      );

      return fallbackStatus;
    }
  }

  private formatMoney(minorUnits: number, currency: string): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(minorUnits / 100);
  }
}

/** Online checkout is stored as `card` until the gateway reports the real instrument. */
function toOrderPaymentMethod(method: CheckoutPaymentMethod): PaymentMethod {
  return method === 'cod' ? 'cod' : 'card';
}

function toShippingAddress(address: AddressRecord): ShippingAddressDto {
  return {
    recipientName: address.recipientName,
    phone: address.phone,
    line1: address.line1,
    ...(address.line2 ? { line2: address.line2 } : {}),
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
  };
}

function toAddressView(address: AddressRecord): CheckoutAddressView {
  return {
    id: address.id,
    label: address.label,
    recipientName: address.recipientName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
  };
}

/** Five working days, weekend-aware, at 09:00 local — a date, not a promise. */
function estimateDelivery(from: Date): Date {
  const date = new Date(from.getTime());
  let remaining = DELIVERY_WORKING_DAYS;

  while (remaining > 0) {
    date.setDate(date.getDate() + 1);

    const day = date.getDay();

    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  date.setHours(9, 0, 0, 0);

  return date;
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

  return 'We could not verify that payment';
}
