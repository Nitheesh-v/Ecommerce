"use client";

import Link from "next/link";
import { ExternalLink, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/admin/ui/card";
import { Pagination } from "@/components/admin/ui/pagination";
import { EmptyState, ErrorState, Skeleton } from "@/components/admin/ui/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/admin/ui/table";
import { getApiErrorMessage, isAbortError } from "@/lib/api/errors";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { customersService } from "@/services/admin/customers.service";
import type { PaginationMeta } from "@/types/auth";
import type { Order } from "@/types/order";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/admin/orders/order-badges";

const PAGE_SIZE = 10;

/**
 * Order history for one customer.
 *
 * Reads the order module's own listing through the customer endpoint, so statuses,
 * totals and badges stay identical to `/admin/orders`.
 */
interface OrdersState {
  key: string;
  orders: Order[];
  meta: PaginationMeta | null;
  error: string | null;
}

export function CustomerOrdersTable({ customerId }: { customerId: string }) {
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<OrdersState>({
    key: "",
    orders: [],
    meta: null,
    error: null,
  });

  // Deriving `loading` from the query key keeps the effect free of setState calls
  // on the happy path (the same pattern the list hooks use).
  const queryKey = useMemo(
    () => `${customerId}|${page}|${reloadToken}`,
    [customerId, page, reloadToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    customersService
      .orders(customerId, { page, limit: PAGE_SIZE })
      .then((result) => {
        if (active) {
          setState({ key: queryKey, orders: result.data, meta: result.meta, error: null });
        }
      })
      .catch((error_: unknown) => {
        if (active && !isAbortError(error_)) {
          setState({ key: queryKey, orders: [], meta: null, error: getApiErrorMessage(error_) });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [customerId, page, queryKey]);

  const loading = state.key !== queryKey;
  const { orders, meta, error } = state;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Order history"
        description={meta ? `${meta.total} order${meta.total === 1 ? "" : "s"}` : undefined}
      />

      {error ? (
        <div className="p-5">
          <ErrorState message={error} onRetry={() => setReloadToken((value) => value + 1)} />
        </div>
      ) : loading && orders.length === 0 ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={ShoppingCart}
            title="No orders yet"
            description="This customer has not ordered anything."
          />
        </div>
      ) : (
        <Table className="min-w-full">
          <TableHead>
            <TableHeaderCell>Order</TableHeaderCell>
            <TableHeaderCell>Date</TableHeaderCell>
            <TableHeaderCell className="text-right">Total</TableHeaderCell>
            <TableHeaderCell>Payment</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell />
          </TableHead>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium whitespace-nowrap text-slate-900">
                  {order.orderNumber}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-slate-500">
                  {formatDateTime(order.createdAt)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap font-medium">
                  {formatCurrency(order.total)}
                </TableCell>
                <TableCell>
                  <PaymentStatusBadge status={order.paymentStatus} />
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={order.status} />
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    View
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {meta && meta.totalPages > 1 ? (
        <Pagination meta={meta} onPageChange={setPage} disabled={loading} />
      ) : null}
    </Card>
  );
}
