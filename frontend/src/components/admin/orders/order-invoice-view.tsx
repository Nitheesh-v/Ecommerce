"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Badge } from "@/components/admin/ui/badge";
import { ErrorState, Skeleton } from "@/components/admin/ui/states";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { ordersService } from "@/services/admin/orders.service";
import { PAYMENT_METHOD_LABELS, type Invoice, type PaymentMethod } from "@/types/order";

/**
 * Printable invoice.
 *
 * Everything on this page comes from the invoice endpoint, which is built from the
 * order's *snapshots* — renaming a product or changing its price later never alters
 * an issued invoice.
 */
export function OrderInvoiceView({ orderId }: { orderId: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    ordersService
      .invoice(orderId)
      .then((result) => {
        if (active) {
          setInvoice(result);
          setError(null);
        }
      })
      .catch((error_: unknown) => {
        if (active) {
          setError(getApiErrorMessage(error_));
        }
      });

    return () => {
      active = false;
    };
  }, [orderId, reloadToken]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState message={error} onRetry={() => setReloadToken((value) => value + 1)} />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { store, customer, totals, payment } = invoice;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <BackLink label={`Back to ${invoice.orderNumber}`} />
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" aria-hidden />
          Print / Save as PDF
        </Button>
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.05)] print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{store.name}</h1>
            {store.legalName && store.legalName !== store.name ? (
              <p className="text-xs text-slate-500">{store.legalName}</p>
            ) : null}
            <address className="mt-2 space-y-0.5 text-xs text-slate-600 not-italic">
              {store.addressLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p>{store.email}</p>
              <p>{store.phone}</p>
              <p>{store.website}</p>
              {store.gstin ? <p>GSTIN: {store.gstin}</p> : null}
            </address>
          </div>

          <div className="text-right">
            <p className="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">
              Tax invoice
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {invoice.invoiceNumber}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Issued {formatDate(invoice.issuedAt)}
            </p>
            <p className="text-xs text-slate-500">Order {invoice.orderNumber}</p>
          </div>
        </header>

        <section className="grid gap-6 border-b border-slate-200 py-5 sm:grid-cols-2">
          <div>
            <h2 className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
              Billed to
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-900">{customer.name}</p>
            <p className="text-xs text-slate-600">{customer.email}</p>
            {customer.phone ? (
              <p className="text-xs text-slate-600">{customer.phone}</p>
            ) : null}
            <address className="mt-1 space-y-0.5 text-xs text-slate-600 not-italic">
              <p>{customer.billingAddress.line1}</p>
              {customer.billingAddress.line2 ? (
                <p>{customer.billingAddress.line2}</p>
              ) : null}
              <p>
                {customer.billingAddress.city}, {customer.billingAddress.state}{" "}
                {customer.billingAddress.postalCode}
              </p>
              <p>{customer.billingAddress.country}</p>
            </address>
          </div>

          <div className="sm:text-right">
            <h2 className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
              Payment
            </h2>
            <p className="mt-1 text-sm text-slate-900">
              {PAYMENT_METHOD_LABELS[payment.method as PaymentMethod] ?? payment.method}
            </p>
            <p className="text-xs text-slate-600">
              Status: <span className="font-medium">{payment.status}</span>
            </p>
            {payment.transactionId ? (
              <p className="text-xs break-all text-slate-600">
                Ref: {payment.transactionId}
              </p>
            ) : null}
            {payment.paidAt ? (
              <p className="text-xs text-slate-600">Paid {formatDateTime(payment.paidAt)}</p>
            ) : null}
          </div>
        </section>

        <section className="py-2">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] tracking-wide text-slate-500 uppercase">
                <th className="py-2 pr-2 font-medium">Item</th>
                <th className="py-2 px-2 text-right font-medium">Qty</th>
                <th className="py-2 px-2 text-right font-medium">Unit price</th>
                <th className="py-2 px-2 text-right font-medium">Discount</th>
                <th className="py-2 pl-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, index) => (
                <tr key={`${line.sku}-${index}`} className="border-b border-slate-100">
                  <td className="py-2 pr-2">
                    <p className="font-medium text-slate-800">{line.name}</p>
                    <p className="text-[11px] text-slate-500">{line.sku}</p>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{line.quantity}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    {formatCurrency(line.unitPrice)}
                  </td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    {line.discount > 0 ? `− ${formatCurrency(line.discount)}` : "—"}
                  </td>
                  <td className="py-2 pl-2 text-right font-medium whitespace-nowrap">
                    {formatCurrency(line.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="ml-auto mt-4 w-full max-w-xs space-y-1.5 text-xs">
          <TotalRow label="Subtotal" value={formatCurrency(totals.subtotal)} />
          {totals.discountTotal > 0 ? (
            <TotalRow
              label="Product discounts"
              value={`− ${formatCurrency(totals.discountTotal)}`}
            />
          ) : null}
          {totals.couponDiscount > 0 ? (
            <TotalRow
              label={`Coupon${totals.couponCode ? ` (${totals.couponCode})` : ""}`}
              value={`− ${formatCurrency(totals.couponDiscount)}`}
            />
          ) : null}
          <TotalRow
            label="Shipping"
            value={totals.shippingCharge === 0 ? "Free" : formatCurrency(totals.shippingCharge)}
          />
          <TotalRow
            label={`Tax${totals.taxRatePercent > 0 ? ` (${totals.taxRatePercent}%)` : ""}`}
            value={formatCurrency(totals.taxAmount)}
          />
          <div className="flex items-center justify-between border-t border-slate-300 pt-2 text-sm font-semibold text-slate-900">
            <span>Grand total</span>
            <span>{formatCurrency(totals.total)}</span>
          </div>
          <TotalRow label="Paid" value={formatCurrency(totals.paidAmount)} />
          {totals.refundedAmount > 0 ? (
            <TotalRow label="Refunded" value={`− ${formatCurrency(totals.refundedAmount)}`} />
          ) : null}
          {totals.balance !== 0 ? (
            <TotalRow label="Balance" value={formatCurrency(totals.balance)} />
          ) : null}
        </section>

        <footer className="mt-6 flex flex-wrap items-end justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="max-w-sm text-[11px] text-slate-500">
            Amounts are in {invoice.currency} and were captured when the order was
            placed. This is a computer-generated invoice.
          </p>
          {totals.refundedAmount > 0 ? (
            <Badge tone="warning">
              Refunded {formatCurrency(totals.refundedAmount)}
            </Badge>
          ) : null}
        </footer>
      </article>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-slate-600">
      <span>{label}</span>
      <span className="whitespace-nowrap text-slate-800">{value}</span>
    </div>
  );
}

function BackLink({ label = "All orders" }: { label?: string }) {
  return (
    <Link
      href="/admin/orders"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Link>
  );
}
