// src/components/store/account/order-invoice.tsx

"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { formatCurrency, formatDate } from "@/lib/utils";
import { myOrdersService } from "@/services/store/orders.service";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  type Invoice,
  type PaymentMethod,
  type PaymentStatus,
} from "@/types/order";

interface State {
  invoice: Invoice | null;
  error: string | null;
}

/**
 * The customer's own invoice.
 *
 * Built from the order's purchase-time snapshots, so a later price change cannot
 * rewrite an invoice that has already been issued. Printing hides the app chrome and
 * leaves the sheet — no PDF service is invented, the browser's print dialog is the
 * export.
 */
export function OrderInvoiceView({ orderId }: { orderId: string }) {
  const [state, setState] = useState<State>({ invoice: null, error: null });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    myOrdersService
      .invoice(orderId, controller.signal)
      .then((invoice) => setState({ invoice, error: null }))
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          setState({ invoice: null, error: getApiErrorMessage(error) });
        }
      });

    return () => controller.abort();
  }, [orderId, reloadToken]);

  if (state.error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <p>{state.error}</p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => setReloadToken((token) => token + 1)}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (!state.invoice) {
    return (
      <div className="space-y-3">
        <div className="h-40 animate-pulse rounded-2xl bg-cream-200" aria-hidden />
        <div className="h-64 animate-pulse rounded-2xl bg-cream-200" aria-hidden />
      </div>
    );
  }

  const { invoice } = state;
  const billing = invoice.customer.billingAddress;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3" data-print-hidden>
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-1 text-xs font-medium text-bark-700 hover:text-bark-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          My orders
        </Link>

        <Button variant="accent" size="sm" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" aria-hidden />
          Print or save as PDF
        </Button>
      </div>

      <article className="rounded-2xl border border-cream-300 bg-cream-50 p-6 sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-cream-300 pb-6">
          <div>
            <p className="font-display text-2xl leading-none text-bark-950">
              {invoice.store.name}
            </p>
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-bark-500">
              {invoice.store.addressLines.join(", ")}
              {invoice.store.gstin ? ` · GSTIN ${invoice.store.gstin}` : ""}
            </p>
            <p className="mt-1 text-xs text-bark-500">
              {invoice.store.email}
              {invoice.store.phone ? ` · ${invoice.store.phone}` : ""}
            </p>
          </div>

          <div className="text-right">
            <p className="text-[10px] tracking-[0.2em] text-bark-500 uppercase">Invoice</p>
            <p className="font-mono text-sm text-bark-950">{invoice.invoiceNumber}</p>
            <p className="mt-2 text-[10px] tracking-[0.2em] text-bark-500 uppercase">Issued</p>
            <p className="text-sm text-bark-800">{formatDate(invoice.issuedAt)}</p>
            <p className="mt-2 text-[10px] tracking-[0.2em] text-bark-500 uppercase">Order</p>
            <p className="font-mono text-sm text-bark-800">{invoice.orderNumber}</p>
          </div>
        </header>

        <section className="grid gap-6 border-b border-cream-300 py-6 sm:grid-cols-2">
          <div>
            <p className="text-[10px] tracking-[0.2em] text-bark-500 uppercase">Billed to</p>
            <p className="mt-1.5 text-sm font-medium text-bark-950">{invoice.customer.name}</p>
            <p className="text-xs text-bark-600">{invoice.customer.email}</p>
            {invoice.customer.phone ? (
              <p className="text-xs text-bark-600">{invoice.customer.phone}</p>
            ) : null}
            <p className="mt-1 text-xs leading-relaxed text-bark-600">
              {billing.line1}
              {billing.line2 ? `, ${billing.line2}` : ""}
              <br />
              {billing.city}, {billing.state} {billing.postalCode}
              <br />
              {billing.country}
            </p>
          </div>

          <div>
            <p className="text-[10px] tracking-[0.2em] text-bark-500 uppercase">Payment</p>
            <p className="mt-1.5 text-sm text-bark-950">
              {PAYMENT_METHOD_LABELS[invoice.payment.method as PaymentMethod] ??
                invoice.payment.method}
            </p>
            <p className="text-xs text-bark-600">
              {PAYMENT_STATUS_LABELS[invoice.payment.status as PaymentStatus] ??
                invoice.payment.status}
              {invoice.payment.paidAt ? ` on ${formatDate(invoice.payment.paidAt)}` : ""}
            </p>
            {invoice.payment.transactionId ? (
              <p className="mt-1 font-mono text-[11px] break-all text-bark-500">
                {invoice.payment.transactionId}
              </p>
            ) : null}
          </div>
        </section>

        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-cream-300 text-[10px] tracking-[0.16em] text-bark-500 uppercase">
              <th className="py-2 font-medium">Item</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Unit</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={`${line.sku}-${line.name}`} className="border-b border-cream-200">
                <td className="py-3 pr-3">
                  <span className="block text-bark-950">{line.name}</span>
                  <span className="block font-mono text-[11px] text-bark-500">{line.sku}</span>
                </td>
                <td className="py-3 text-right tabular-nums text-bark-800">{line.quantity}</td>
                <td className="py-3 text-right tabular-nums text-bark-800">
                  {formatCurrency(line.unitPrice)}
                </td>
                <td className="py-3 text-right font-medium tabular-nums text-bark-950">
                  {formatCurrency(line.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 ml-auto max-w-sm space-y-1.5 text-sm">
          <Row label="Subtotal" value={formatCurrency(invoice.totals.subtotal)} />
          {invoice.totals.discountTotal > 0 ? (
            <Row
              label="Discounts"
              value={`− ${formatCurrency(invoice.totals.discountTotal)}`}
            />
          ) : null}
          {invoice.totals.couponDiscount > 0 ? (
            <Row
              label={`Coupon${invoice.totals.couponCode ? ` (${invoice.totals.couponCode})` : ""}`}
              value={`− ${formatCurrency(invoice.totals.couponDiscount)}`}
            />
          ) : null}
          <Row label="Shipping" value={formatCurrency(invoice.totals.shippingCharge)} />
          <Row
            label={`Tax (${invoice.totals.taxRatePercent}%)`}
            value={formatCurrency(invoice.totals.taxAmount)}
          />
          <div className="flex items-baseline justify-between border-t border-cream-300 pt-2">
            <span className="font-medium text-bark-950">Total</span>
            <span className="font-display text-lg text-bark-950">
              {formatCurrency(invoice.totals.total)}
            </span>
          </div>
          <Row label="Paid" value={formatCurrency(invoice.totals.paidAmount)} muted />
          {invoice.totals.refundedAmount > 0 ? (
            <Row
              label="Refunded"
              value={`− ${formatCurrency(invoice.totals.refundedAmount)}`}
              muted
            />
          ) : null}
          {invoice.totals.balance > 0 ? (
            <Row label="Balance due" value={formatCurrency(invoice.totals.balance)} />
          ) : null}
        </div>

        <p className="mt-8 border-t border-cream-300 pt-4 text-[11px] text-bark-500">
          Amounts are printed from the order as it was placed. This is a computer-generated
          invoice — no signature is required.
        </p>
      </article>
    </div>
  );
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={muted ? "text-bark-500" : "text-bark-700"}>{label}</span>
      <span className={`tabular-nums ${muted ? "text-bark-500" : "text-bark-900"}`}>
        {value}
      </span>
    </div>
  );
}
