import type { AuthSessionPayload, AuthUser } from "@/types/auth";

/**
 * In-memory session store.
 *
 * The access token lives here — never in `localStorage`/`sessionStorage`/cookies
 * that JavaScript can read. A page reload therefore starts empty and recovers the
 * session with a silent refresh against the HttpOnly `refresh_token` cookie.
 *
 * Kept as a plain module (not a Zustand store) so the Axios client can read the
 * token without importing React or the auth store, which would create a cycle:
 * `store -> service -> client -> store`.
 */

type SessionListener = (payload: AuthSessionPayload | null) => void;
type ExpiredListener = () => void;

let current: AuthSessionPayload | null = null;
const listeners = new Set<SessionListener>();
const expiredListeners = new Set<ExpiredListener>();

export const session = {
  get: (): AuthSessionPayload | null => current,

  getUser: (): AuthUser | null => current?.user ?? null,

  getAccessToken: (): string | null => current?.accessToken ?? null,

  set(payload: AuthSessionPayload | null): void {
    current = payload;

    for (const listener of listeners) {
      listener(payload);
    }
  },

  clear(): void {
    session.set(null);
  },

  subscribe(listener: SessionListener): () => void {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  },

  /** Fired when a silent refresh fails, i.e. the session is genuinely gone. */
  onExpired(listener: ExpiredListener): () => void {
    expiredListeners.add(listener);

    return () => {
      expiredListeners.delete(listener);
    };
  },

  notifyExpired(): void {
    for (const listener of expiredListeners) {
      listener();
    }
  },
};
