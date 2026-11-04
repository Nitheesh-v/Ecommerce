import { apiClient, requestData } from "@/lib/api/client";
import type { DashboardOverview, DashboardRangeKey } from "@/types/admin";

export interface DashboardQuery {
  range: DashboardRangeKey;
  /** Required when `range` is `custom`; ISO 8601 date/time. */
  from?: string;
  to?: string;
}

export const adminDashboardService = {
  getOverview({ range, from, to }: DashboardQuery, signal?: AbortSignal) {
    return requestData<DashboardOverview>(
      apiClient.get("/admin/dashboard/overview", {
        signal,
        params: {
          range,
          ...(range === "custom" && from && to ? { from, to } : {}),
        },
      }),
    );
  },
};
