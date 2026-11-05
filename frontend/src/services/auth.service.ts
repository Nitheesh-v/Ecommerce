import { apiClient, requestData } from "@/lib/api/client";
import type { AuthSessionPayload, AuthUser } from "@/types/auth";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  phone?: string;
}

export const authService = {
  login(credentials: LoginCredentials) {
    return requestData<AuthSessionPayload>(
      apiClient.post("/auth/login", credentials),
    );
  },

  /** Creates a customer account; the API signs the new customer in. */
  register(payload: RegisterPayload) {
    return requestData<AuthSessionPayload>(
      apiClient.post("/auth/register", payload),
    );
  },

  /** Uses the HttpOnly refresh cookie; the token itself is never visible here. */
  refresh() {
    return requestData<AuthSessionPayload>(apiClient.post("/auth/refresh"));
  },

  async logout(): Promise<void> {
    await apiClient.post("/auth/logout");
  },

  me() {
    return requestData<AuthUser>(apiClient.get("/auth/me"));
  },
};
