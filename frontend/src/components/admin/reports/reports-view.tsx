"use client";

import { Download, FileText, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { PageHeader } from "@/components/admin/ui/page-header";
import { ErrorState } from "@/components/admin/ui/states";
import { RangeFilter, type RangeSelection } from "@/components/admin/dashboard/range-filter";
import { useReports } from "@/hooks/use-reports";
import { useStoreSettings } from "@/hooks/use-store-settings";
import { getApiErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { ReportTab } from "@/types/report";
import { CustomersPanel } from "./customers-panel";
import { SalesPanel } from "./sales-panel";

const TABS: { key: ReportTab; label: string; icon: typeof FileText }[] = [
  { key: "sales", label: "Sales", icon: FileText },
  { key: "customers", label: "Customers", icon: Users },
];

/**
 * Reports — sales and customers, over one shared date range.
 *
 * CSV is the only export: the same numbers the screen shows, with the range in the
 * header, so a spreadsheet and the console can never disagree.
 */
export function ReportsView() {
  const {
    selection,
    setSelection,
    tab,
    setTab,
    loading,
    error,
    sales,
    customers,
    exportCsv,
    exporting,
  } = useReports();
  const { settings } = useStoreSettings();
  const [exportError, setExportError] = useState<string | null>(null);

  const currency = settings?.currency ?? "INR";
  const locale = settings?.locale ?? "en-IN";

  const download = async () => {
    setExportError(null);

    try {
      await exportCsv();
    } catch (cause) {
      setExportError(getApiErrorMessage(cause));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Sales and customer performance for any window, downloadable as CSV."
        actions={
          <Button variant="secondary" onClick={download} disabled={exporting}>
            <Download className="mr-2 h-4 w-4" aria-hidden />
            {exporting ? "Preparing…" : `Export ${tab}`}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Report"
          className="inline-flex rounded-lg border border-slate-200 bg-white p-1"
        >
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === key
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <RangeFilter
          value={selection}
          onChange={(next: RangeSelection) => setSelection(next)}
        />
      </div>

      {exportError ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {exportError}
        </div>
      ) : null}

      {error ? (
        <ErrorState message={error} />
      ) : tab === "sales" ? (
        <SalesPanel report={sales} loading={loading} currency={currency} locale={locale} />
      ) : (
        <CustomersPanel
          report={customers}
          loading={loading}
          currency={currency}
          locale={locale}
        />
      )}
    </div>
  );
}
