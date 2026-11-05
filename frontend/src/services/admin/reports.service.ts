import { apiClient, requestData } from "@/lib/api/client";
import type { DashboardRangeKey } from "@/types/admin";
import type { CustomerReport, SalesReport } from "@/types/report";

export interface ReportQuery {
  range: DashboardRangeKey;
  from?: string;
  to?: string;
}

function toParams(query: ReportQuery) {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== undefined && value !== "" && value !== null,
    ),
  );
}

/** Reports — sales and customers, with the matching CSV downloads. */
export const reportsService = {
  sales(query: ReportQuery, signal?: AbortSignal) {
    return requestData<SalesReport>(
      apiClient.get("/admin/reports/sales", { signal, params: toParams(query) }),
    );
  },

  customers(query: ReportQuery, signal?: AbortSignal) {
    return requestData<CustomerReport>(
      apiClient.get("/admin/reports/customers", { signal, params: toParams(query) }),
    );
  },

  /** Downloads the API-generated export and returns the file name. */
  async exportCsv(tab: "sales" | "customers", query: ReportQuery): Promise<string> {
    const response = await apiClient.get<Blob>(`/admin/reports/${tab}/export`, {
      params: toParams(query),
      responseType: "blob",
    });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    const prefix = tab === "sales" ? "sales-report" : "customer-report";

    link.href = url;
    link.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    return link.download;
  },
};
