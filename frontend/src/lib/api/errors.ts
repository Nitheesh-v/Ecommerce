import axios from "axios";
import type { ApiError } from "@/types/auth";

const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

/**
 * Turns any thrown value into a message that is safe to show a user.
 *
 * The API already returns user-safe messages for expected failures
 * (`{ success: false, message, details? }`); everything else stays generic so
 * internals are never leaked into the UI.
 */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiError>(error)) {
    if (error.code === "ERR_NETWORK") {
      return "Cannot reach the server. Check that the API is running.";
    }

    if (error.code === "ECONNABORTED") {
      return "The request timed out. Please try again.";
    }

    const payload = error.response?.data;

    if (payload && typeof payload.message === "string") {
      const details = payload.details?.length
        ? ` ${payload.details.join(" ")}`
        : "";

      return `${payload.message}${details}`;
    }

    if (error.response?.status === 429) {
      return "Too many attempts. Please wait a moment and try again.";
    }

    return error.message || FALLBACK_MESSAGE;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return FALLBACK_MESSAGE;
}

export function getApiErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

export function isAbortError(error: unknown): boolean {
  return axios.isCancel(error) || (error instanceof Error && error.name === "AbortError");
}
