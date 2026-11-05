"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { reportsService } from "@/services/admin/reports.service";
import type { CustomerReport, ReportTab, SalesReport } from "@/types/report";
import type { RangeSelection } from "@/components/admin/dashboard/range-filter";

interface ReportState {
  key: string;
  sales: SalesReport | null;
  customers: CustomerReport | null;
  error: string | null;
}

const INITIAL_STATE: ReportState = {
  key: "",
  sales: null,
  customers: null,
  error: null,
};

function queryFor(selection: RangeSelection) {
  return {
    range: selection.range,
    from: selection.range === "custom" ? selection.from : undefined,
    to: selection.range === "custom" ? selection.to : undefined,
  };
}

function keyFor(selection: RangeSelection) {
  return `${selection.range}:${selection.from ?? ""}:${selection.to ?? ""}`;
}

/**
 * Both reports for one window.
 *
 * They are fetched together because each is a handful of aggregations and the tabs
 * should switch instantly; `loading` is derived from the settled key so a stale
 * range is never labelled as the current one.
 */
export function useReports(initial: RangeSelection = { range: "30d" }) {
  const [selection, setSelection] = useState<RangeSelection>(initial);
  const [tab, setTab] = useState<ReportTab>("sales");
  const [state, setState] = useState<ReportState>(INITIAL_STATE);
  const [exporting, setExporting] = useState(false);

  const key = keyFor(selection);
  const loading = state.key !== key;

  useEffect(() => {
    // A custom range without both bounds is what the API rejects; wait for it.
    if (selection.range === "custom" && (!selection.from || !selection.to)) {
      return;
    }

    const controller = new AbortController();
    const query = queryFor(selection);

    Promise.all([
      reportsService.sales(query, controller.signal),
      reportsService.customers(query, controller.signal),
    ])
      .then(([sales, customers]) => {
        if (!controller.signal.aborted) {
          setState({ key, sales, customers, error: null });
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted && !isAbortError(cause)) {
          setState((current) => ({
            ...current,
            key,
            error: getApiErrorMessage(cause),
          }));
        }
      });

    return () => controller.abort();
  }, [key, selection, selection.range, selection.from, selection.to]);

  const exportCsv = useCallback(async () => {
    setExporting(true);

    try {
      return await reportsService.exportCsv(tab, queryFor(selection));
    } finally {
      setExporting(false);
    }
  }, [tab, selection]);

  return {
    selection,
    setSelection,
    tab,
    setTab,
    key,
    loading,
    error: state.error,
    sales: state.sales,
    customers: state.customers,
    exportCsv,
    exporting,
  };
}
