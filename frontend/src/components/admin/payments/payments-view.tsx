"use client";

import { CreditCard, ShieldCheck } from "lucide-react";
import { Card, CardHeader } from "@/components/admin/ui/card";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Pagination } from "@/components/admin/ui/pagination";
import { Button } from "@/components/admin/ui/button";
import { EmptyState, ErrorState } from "@/components/admin/ui/states";
import { usePaymentList, usePaymentSummary } from "@/hooks/use-payment-list";
import type { PaymentSortField } from "@/types/payment";
import { PaymentSummaryCards } from "./payment-summary-cards";
import { PaymentsFiltersBar } from "./payments-filters";
import { PaymentsTable } from "./payments-table";

/**
 * Payments console.
 *
 * Read-only by design plus a refund action: there is no "mark as paid" control
 * anywhere, because a payment status is a gateway fact, not an operator opinion.
 */
export function PaymentsView() {
  const {
    filters,
    update,
    reset,
    refresh,
    items,
    meta,
    error,
    loading,
    hasActiveFilters,
  } = usePaymentList();
  const summary = usePaymentSummary();

  const onSort = (field: PaymentSortField) => {
    update({
      sortBy: field,
      sortOrder:
        filters.sortBy === field && filters.sortOrder === "desc" ? "asc" : "desc",
    });
  };

  const reloadAll = () => {
    refresh();
    summary.refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments"
        description="Every gateway transaction, verified against Razorpay. Statuses change from gateway events only."
        actions={
          <Button variant="secondary" onClick={reloadAll}>
            Refresh
          </Button>
        }
      />

      {summary.error ? (
        <ErrorState message={summary.error} onRetry={summary.refresh} />
      ) : (
        <PaymentSummaryCards summary={summary.summary} loading={summary.loading} />
      )}

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      <Card className="overflow-hidden">
        <CardHeader
          title="Transactions"
          description="Search by transaction, order id, customer name or email."
          action={
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              Gateway-verified
            </span>
          }
        />

        <PaymentsFiltersBar
          filters={filters}
          onChange={update}
          onReset={reset}
          hasActiveFilters={hasActiveFilters}
          total={meta?.total ?? 0}
        />

        {!loading && items.length === 0 && meta !== null ? (
          <div className="p-5">
            <EmptyState
              icon={CreditCard}
              title={
                hasActiveFilters
                  ? "No transactions match these filters"
                  : "No payments yet"
              }
              description={
                hasActiveFilters
                  ? "Try a different search term, status, method or date range."
                  : "Online payments appear here as soon as a customer opens checkout."
              }
              action={
                hasActiveFilters ? (
                  <Button variant="secondary" size="sm" onClick={reset}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <PaymentsTable
            payments={items}
            loading={loading}
            sortBy={filters.sortBy}
            sortOrder={filters.sortOrder}
            onSort={onSort}
          />
        )}

        {meta ? (
          <Pagination
            meta={meta}
            onPageChange={(page) => update({ page })}
            disabled={loading}
          />
        ) : null}
      </Card>
    </div>
  );
}
