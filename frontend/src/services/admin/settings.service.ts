import { apiClient, requestData } from "@/lib/api/client";
import type { StoreSettings, UpdateSettingsPayload } from "@/types/settings";

/** Store settings — one document the admin console owns. */
export const settingsService = {
  get(signal?: AbortSignal) {
    return requestData<StoreSettings>(apiClient.get("/admin/settings", { signal }));
  },

  save(payload: UpdateSettingsPayload) {
    return requestData<StoreSettings>(apiClient.patch("/admin/settings", payload));
  },
};
