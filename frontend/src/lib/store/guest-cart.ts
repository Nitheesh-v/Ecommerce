// src/lib/store/guest-cart.ts

/**
 * The guest cart token.
 *
 * A shopper with no account still needs a cart, so the server addresses an
 * anonymous basket by an opaque id the browser owns. Where it lives is the one
 * interesting decision:
 *
 * - **`localStorage`, not a cookie** — the API is on a different origin in
 *   development (`:5000` vs `:3000`), and a cookie that has to be `SameSite=None`
 *   to travel there is a third-party cookie most browsers now block. A header this
 *   client sets explicitly cannot be blocked or silently dropped.
 * - **Not `sessionStorage`** — a guest who closes the tab and comes back should
 *   still find their basket; that is the whole point of a cart.
 * - **Not the session module** — the access token must vanish on reload, this must
 *   not. Keeping them apart is why one is in memory and this is on disk.
 *
 * The token is a bearer credential for one cart and nothing else: it cannot read an
 * order, an address or an account, and the server retires it forever once an
 * account claims the cart (see `POST /api/cart/merge`).
 */

const STORAGE_KEY = "ecommerce26.guest-cart";

/** 32 random bytes, base64url — matches the server's `GUEST_TOKEN_PATTERN`. */
function createToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

let cached: string | null | undefined;

/** `null` when unavailable (server render, or storage disabled entirely). */
function read(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (cached !== undefined) {
    return cached;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (stored && /^[A-Za-z0-9_-]{24,64}$/.test(stored)) {
      cached = stored;

      return cached;
    }
  } catch {
    // Private mode with storage blocked: fall through and mint one for this page.
  }

  cached = null;

  return null;
}

function write(token: string): void {
  cached = token;

  try {
    window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Storage blocked; the in-memory copy still carries this page's cart.
  }
}

export const guestCart = {
  /** The existing token, or one minted on the spot. Never empty in the browser. */
  get(): string {
    return read() ?? createTokenWithPersist();
  },

  /** Only if one exists — used when deciding whether a merge has anything to do. */
  peek(): string | null {
    return read();
  },

  /** After a successful merge the token is spent; the next guest cart gets a new one. */
  clear(): void {
    cached = null;

    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do; the token will be replaced on next use.
    }
  },

  /**
   * The header every cart/checkout request carries.
   *
   * Set even when signed in: the server ignores it for a token-bearing caller
   * (the account's cart wins), and sending it keeps one code path on both sides.
   */
  header(): Record<string, string> {
    const token = read();

    return token ? { "x-cart-id": token } : {};
  },
};

function createTokenWithPersist(): string {
  const token = createToken();

  write(token);

  return token;
}

/**
 * The email a guest checked out with, remembered per order id.
 *
 * The confirmation page needs it to read the order back, and it must survive a
 * reload — otherwise a guest who refreshes loses the only thing that would let them
 * see their own order. Scoped to one order id and overwritten by the next checkout,
 * so this never accumulates addresses.
 */
const ORDER_EMAIL_KEY = "ecommerce26.guest-order-email";
const MAX_REMEMBERED = 3;

export const guestOrderEmail = {
  remember(orderId: string, email: string): void {
    try {
      const stored = readOrderEmails();

      stored[orderId] = email.trim();

      // Keep only the latest few: a shared browser must not hoard addresses.
      const entries = Object.entries(stored).slice(-MAX_REMEMBERED);

      window.localStorage.setItem(ORDER_EMAIL_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch {
      // Storage unavailable — the confirmation screen will ask for the email.
    }
  },

  get(orderId: string): string | null {
    try {
      return readOrderEmails()[orderId] ?? null;
    } catch {
      return null;
    }
  },
};

function readOrderEmails(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(ORDER_EMAIL_KEY);

  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
