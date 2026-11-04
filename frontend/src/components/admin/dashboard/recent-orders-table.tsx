import { ShoppingCart } from "lucide-react";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/ui/badge";
import { Card, CardHeader } from "@/components/admin/ui/card";
import { EmptyState } from "@/components/admin/ui/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/admin/ui/table";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { RecentOrder } from "@/types/admin";

export function RecentOrdersTable({ orders }: { orders: RecentOrder[] }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader
        title="Recent orders"
        description="Latest orders placed in this period"
      />
      {orders.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={ShoppingCart}
            title="No orders in this period"
            description="New orders will appear here with their status and payment state."
          />
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableHeaderCell>Order</TableHeaderCell>
            <TableHeaderCell>Customer</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Payment</TableHeaderCell>
            <TableHeaderCell className="text-right">Total</TableHeaderCell>
          </TableHead>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <span className="block font-medium text-slate-900">
                    {order.orderNumber}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {formatDateTime(order.createdAt)}
                  </span>
                </TableCell>
                <TableCell className="max-w-[12rem] truncate">
                  {order.customerName}
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={order.status} />
                </TableCell>
                <TableCell>
                  <PaymentStatusBadge status={order.paymentStatus} />
                </TableCell>
                <TableCell className="text-right font-medium text-slate-900 tabular-nums">
                  {formatCurrency(order.total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
