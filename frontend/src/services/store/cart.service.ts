// src/services/store/cart.service.ts

import { apiClient, requestData } from "@/lib/api/client";
import type {
  Cart,
  CheckoutPaymentHandoff,
  CheckoutPaymentMethod,
  CheckoutPreview,
  PaymentConfirmation,
  PlacedOrder,
} from "@/types/cart";

/**
 * Cart API (`/api/cart`).
 *
 * Every method returns the **whole cart**, recomputed by the server: prices, the
 * coupon discount, shipping, tax and the total. The browser never posts an amount
 * and never patches a total locally, so a stale tab cannot show a price the order
 * will not honour.
 */
export const cartService = {
  getCart(signal?: AbortSignal) {
    return requestData<Cart>(apiClient.get("/cart", { signal }));
  },

  addToCart(input: { productId: string; quantity?: number }) {
    return requestData<Cart>(
      apiClient.post("/cart/items", {
        productId: input.productId,
        quantity: input.quantity ?? 1,
      }),
    );
  },

  /** `quantity: 0` removes the line — the same thing as `removeCartItem`. */
  updateCartItem(productId: string, quantity: number) {
    return requestData<Cart>(apiClient.patch(`/cart/items/${productId}`, { quantity }));
  },

  removeCartItem(productId: string) {
    return requestData<Cart>(apiClient.delete(`/cart/items/${productId}`));
  },

  clearCart() {
    return requestData<Cart>(apiClient.delete("/cart"));
  },

  applyCoupon(code: string) {
    return requestData<Cart>(apiClient.post("/cart/coupon", { code }));
  },

  removeCoupon() {
    return requestData<Cart>(apiClient.delete("/cart/coupon"));
  },
};

/** Where the customer intends to pay. */
export interface PlaceOrderInput {
  addressId: string;
  paymentMethod: CheckoutPaymentMethod;
  customerNote?: string;
  /** Makes a double-click idempotent instead of placing two orders. */
  idempotencyKey?: string;
}

/**
 * Checkout API (`/api/checkout`).
 *
 * `preview` is a genuine dry run — no order, no reservation — so the page can call
 * it whenever the customer changes address or payment method. `place` is the only
 * write, and it re-validates everything the preview checked.
 */
export const checkoutApi = {
  previewCheckout(
    input: { addressId: string; paymentMethod: CheckoutPaymentMethod },
    signal?: AbortSignal,
  ) {
    return requestData<CheckoutPreview>(
      apiClient.post("/checkout/preview", input, { signal }),
    );
  },

  placeOrder(input: PlaceOrderInput) {
    return requestData<PlacedOrder>(apiClient.post("/checkout/place", input));
  },

  /**
   * Confirms a gateway payment. The signature is verified and the payment re-read
   * from the gateway on the server; this call only reports the outcome.
   */
  verifyPayment(input: {
    gatewayOrderId: string;
    gatewayPaymentId: string;
    signature: string;
  }) {
    return requestData<PaymentConfirmation>(
      apiClient.post("/checkout/verify-payment", input),
    );
  },
};

/** Convenience alias so a caller can find the gateway hand-off type. */
export type { CheckoutPaymentHandoff };
