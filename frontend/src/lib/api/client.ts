import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { ApiSuccess, AuthSessionPayload, PaginationMeta } from "@/types/auth";
import { session } from "./session";

/**
 * Axios client used by every browser-side call.
 *
 * - `withCredentials` is required for the HttpOnly refresh cookie.
 * - The access token is attached per request from the in-memory session.
 * - A 401 triggers exactly one refresh (single-flight, shared by concurrent
 *   requests) and then replays the original request once. Any other outcome
 *   clears the session and notifies listeners so the UI can redirect to login.
 */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api"
).replace(/\/+$/, "");

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20_000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const token = session.getAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/** Endpoints that must never trigger the refresh-and-retry loop. */
const AUTH_ENDPOINTS = ["/auth/login", "/auth/refresh", "/auth/logout"];

type RetriableRequest = InternalAxiosRequestConfig & { _retried?: boolean };

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  // A bare Axios call: it has no interceptors, so a failing refresh cannot recurse.
  const response = await axios.post<ApiSuccess<AuthSessionPayload>>(
    `${API_BASE_URL}/auth/refresh`,
    null,
    { withCredentials: true, timeout: 20_000 },
  );

  const payload = response.data.data;
  session.set(payload);

  return payload.accessToken;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetriableRequest | undefined;
    const url = request?.url ?? "";
    const isAuthCall = AUTH_ENDPOINTS.some((endpoint) => url.includes(endpoint));

    if (
      error.response?.status !== 401 ||
      !request ||
      request._retried ||
      isAuthCall
    ) {
      return Promise.reject(error);
    }

    request._retried = true;

    try {
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });

      const accessToken = await refreshPromise;
      request.headers.Authorization = `Bearer ${accessToken}`;

      return await apiClient(request);
    } catch (refreshError) {
      session.clear();
      session.notifyExpired();

      return Promise.reject(refreshError);
    }
  },
);

/** Unwraps the `{ success, data }` envelope. */
export async function requestData<T>(
  request: Promise<{ data: ApiSuccess<T> }>,
): Promise<T> {
  const response = await request;

  return response.data.data;
}

/**
 * Unwraps a paginated envelope into `{ data, meta }`.
 *
 * List endpoints return `{ success, data, meta }`; the admin tables need the
 * pagination metadata, so it is returned alongside the rows instead of dropped.
 */
export async function requestPage<T>(
  request: Promise<{ data: ApiSuccess<T[]> }>,
): Promise<{ data: T[]; meta: PaginationMeta }> {
  const response = await request;
  const { data, meta } = response.data;

  return {
    data,
    meta: meta ?? {
      page: 1,
      limit: data.length,
      total: data.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}
