export type UserRole = "customer" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName?: string;
  role: UserRole;
  createdAt: string;
}

/** Body of `/auth/login`, `/auth/register` and `/auth/refresh`. */
export interface AuthSessionPayload {
  user: AuthUser;
  accessToken: string;
  tokenType: string;
}

/** Pagination metadata attached to every list response. */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** Every backend response uses this envelope. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  statusCode: number;
  error: string;
  message: string;
  details?: string[];
  path: string;
  method: string;
  timestamp: string;
  requestId?: string;
}
