"use client";

// src/store/cart.store.ts

import { create } from "zustand";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api/errors";
import { session } from "@/lib/api/session";
import { guestCart } from "@/lib/store/guest-cart";
import { cartService } from "@/services/store/cart.service";
import { toast } from "@/store/toast.store";
import type { Cart } from "@/types/cart";

/** How long the quantity stepper waits before it writes to the server. */
const QUANTITY_DEBOUNCE_MS = 500;

export type CartStatus = "idle" | "loading" | "ready" | "signed-out" | "error";

interface CartState {
  cart: Cart | null;
  status: CartStatus;
  error: string | null;
  /** Cached so the header badge does not have to recompute on every render. */
  itemCount: number;
  /** Product id whose quantity write is in flight — drives "Updating…". */
  updatingItemId: string | null;
  couponPending: boolean;
  couponError: string | null;

  fetchCart: () => Promise<void>;
  addItem: (productId: string, quantity?: number) => Promise<boolean>;
  /**
   * Optimistic quantity change. The number shown changes immediately, the write is
   * debounced, and a rejection puts the server's own cart back on screen.
   */
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  applyCoupon: (code: string) => Promise<boolean>;
  removeCoupon: () => Promise<void>;
  reset: () => void;
  /** Hands this browser's guest cart to the account that just signed in. */
  mergeGuestCart: () => Promise<void>;
}

/** Writes waiting out the debounce window, one per product. */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelPendingQuantity(productId: string): void {
  const timer = timers.get(productId);

  if (timer) {
    clearTimeout(timer);
    timers.delete(productId);
  }
}

function cancelAllPendingQuantities(): void {
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }

  timers.clear();
}

/**
 * The cart, as the server sees it.
 *
 * Every mutation stores the cart the API returns rather than patching the previous
 * one, because the API recomputes prices, the coupon, shipping and tax together —
 * a local patch would be a second, wrong implementation of the price list.
 *
 * It also owns the session wiring: signing in loads the cart, signing out (or an
 * expired refresh) empties it, so a shared browser cannot show one customer's
 * basket to the next.
 */
export const useCartStore = create<CartState>((set, get) => {
  const apply = (cart: Cart): void => {
    set({
      cart,
      status: "ready",
      error: null,
      itemCount: cart.totals.itemCount,
      updatingItemId: null,
    });
  };

  const fail = (error: unknown): void => {
    set({ updatingItemId: null });
    toast.error(getApiErrorMessage(error));
  };

  return {
    cart: null,
    status: "idle",
    error: null,
    itemCount: 0,
    updatingItemId: null,
    couponPending: false,
    couponError: null,

    fetchCart: async () => {
      if (get().status === "loading") {
        return;
      }

      set({ status: "loading", error: null, couponError: null });

      try {
        apply(await cartService.getCart());
      } catch (error) {
        // 401 here means this browser has neither a token nor a guest id — a
        // storage-blocked browser. Show an empty cart rather than an error: the
        // shopper can still shop, the basket simply will not persist.
        if (getApiErrorStatus(error) === 401) {
          set({ cart: null, status: "ready", itemCount: 0, error: null });

          return;
        }

        set({ status: "error", error: getApiErrorMessage(error) });
      }
    },

    addItem: async (productId, quantity = 1) => {
      cancelPendingQuantity(productId);

      try {
        // Works signed out: the request carries the guest cart id, so a shopper
        // never has to create an account to fill a basket.
        const cart = await cartService.addToCart({ productId, quantity });

        apply(cart);
        toast.success("Added to your cart");

        return true;
      } catch (error) {
        fail(error);

        return false;
      }
    },

    updateQuantity: (productId, quantity) => {
      const cart = get().cart;

      if (!cart) {
        return;
      }

      if (quantity < 1) {
        void get().removeItem(productId);

        return;
      }

      // Optimistic: the stepper responds instantly; totals wait for the server.
      set({
        updatingItemId: productId,
        cart: {
          ...cart,
          items: cart.items.map((item) =>
            item.productId === productId
              ? {
                  ...item,
                  quantity,
                  lineTotal: item.unitPrice * quantity,
                }
              : item,
          ),
        },
      });

      cancelPendingQuantity(productId);
      timers.set(
        productId,
        setTimeout(() => {
          timers.delete(productId);

          void (async () => {
            try {
              apply(await cartService.updateCartItem(productId, quantity));
            } catch (error) {
              // Put the server's version back rather than leaving the guess on screen.
              fail(error);
              await get().fetchCart();
            }
          })();
        }, QUANTITY_DEBOUNCE_MS),
      );
    },

    removeItem: async (productId) => {
      cancelPendingQuantity(productId);
      set({ updatingItemId: productId });

      try {
        apply(await cartService.removeCartItem(productId));
      } catch (error) {
        fail(error);
      }
    },

    clearCart: async () => {
      cancelAllPendingQuantities();

      try {
        apply(await cartService.clearCart());
        toast.success("Cart cleared");
      } catch (error) {
        fail(error);
      }
    },

    applyCoupon: async (code) => {
      set({ couponPending: true, couponError: null });

      try {
        apply(await cartService.applyCoupon(code.trim().toUpperCase()));
        toast.success("Coupon applied");

        return true;
      } catch (error) {
        const message = getApiErrorMessage(error);

        set({ couponError: message, couponPending: false });

        return false;
      } finally {
        set({ couponPending: false });
      }
    },

    removeCoupon: async () => {
      set({ couponPending: true, couponError: null });

      try {
        apply(await cartService.removeCoupon());
        toast.info("Coupon removed");
      } catch (error) {
        fail(error);
      } finally {
        set({ couponPending: false });
      }
    },

    mergeGuestCart: async () => {
      const guestToken = guestCart.peek();

      if (!guestToken) {
        // Nothing to merge; just show the account's cart.
        await get().fetchCart();

        return;
      }

      try {
        apply(await cartService.mergeGuestCart(guestToken));
      } catch (error) {
        // The account's cart is still there; a failed merge must not look like a
        // failed sign-in, so this is silent and the token is kept for a retry.
        if (getApiErrorStatus(error) !== 401) {
          toast.error(getApiErrorMessage(error));
        }

        return;
      }

      // The server retired that cart, so this token is spent.
      guestCart.clear();
    },

    reset: () => {
      cancelAllPendingQuantities();
      set({
        cart: null,
        status: "idle",
        error: null,
        itemCount: 0,
        updatingItemId: null,
        couponPending: false,
        couponError: null,
      });
    },
  };
});

/**
 * One subscription for the whole app: the cart follows the session.
 *
 * Kept outside React so it also fires for a silent refresh (`session.set`) that no
 * component initiated — a reload restores the cart without any page doing work.
 */
let wired = false;

function wireSession(): void {
  if (wired) {
    return;
  }

  wired = true;

  session.subscribe((payload) => {
    if (payload) {
      // Signing in adopts whatever this browser was shopping with, then shows the
      // merged cart — the shopper does not lose a basket by signing in.
      void useCartStore.getState().mergeGuestCart();
    } else {
      useCartStore.getState().reset();
    }
  });

  session.onExpired(() => {
    useCartStore.getState().reset();
  });
}

wireSession();

/** Item count for the header badge; `0` until the cart has loaded. */
export function useCartItemCount(): number {
  return useCartStore((state) => state.itemCount);
}
