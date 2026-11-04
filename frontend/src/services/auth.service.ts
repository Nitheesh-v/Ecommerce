import { apiClient, requestData } from "@/lib/api/client";
import type { AuthSessionPayload, AuthUser } from "@/types/auth";

export interface LoginCredentials {
  email: string;
  password: string;
}

export const authService = {
  login(credentials: LoginCredentials) {
    return requestData<AuthSessionPayload>(
      apiClient.post("/auth/login", credentials),
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
