import {
  Activity,
  AlertTriangle,
  ShoppingCart,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { EmptyState } from "@/components/admin/ui/states";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type {
  LowStockProduct,
  RecentCustomer,
  RecentOrder,
} from "@/types/admin";

interface ActivityEntry {
  id: string;
  icon: LucideIcon;
  iconClass: string;
  title: string;
  description: string;
  timestamp?: string;
}

/**
 * Composed on the client from the three newest-activity feeds the API already
 * returns. There is no audit-log endpoint yet, so nothing here is invented: every
 * row maps to a real order, customer or stock record.
 */
export function ActivityFeed({
  orders,
  customers,
  lowStock,
}: {
  orders: RecentOrder[];
  customers: RecentCustomer[];
  lowStock: LowStockProduct[];
}) {
  const collected: ActivityEntry[] = [
    ...orders.map((order) => ({
      id: `order-${order.id}`,
      icon: ShoppingCart,
      iconClass: "bg-sky-50 text-sky-600",
      title: `Order ${order.orderNumber} received`,
      description: `${order.customerName} · ${formatCurrency(order.total)}`,
      timestamp: order.createdAt,
    })),
    ...customers.map((customer) => ({
      id: `customer-${customer.id}`,
      icon: UserPlus,
      iconClass: "bg-emerald-50 text-emerald-600",
      title: "New customer registered",
      description: `${customer.name} · ${customer.email}`,
      timestamp: customer.createdAt,
    })),
    ...lowStock.map((product) => ({
      id: `stock-${product.id}`,
      icon: AlertTriangle,
      iconClass: "bg-amber-50 text-amber-600",
      title: `Low stock: ${product.name}`,
      description: `${product.stock} left · reorder threshold ${product.lowStockThreshold}`,
    })),
  ];

  const entries = collected
    .sort((a, b) => {
      if (!a.timestamp && !b.timestamp) return 0;
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    })
    .slice(0, 8);

  return (
    <Card className="min-w-0">
      <CardHeader
        title="Recent activity"
        description="Orders, sign-ups and stock alerts"
      />
      <CardBody className="px-3 py-2">
        {entries.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="Nothing happened yet"
            description="Activity is built from orders, new accounts and low-stock alerts."
            className="border-0"
          />
        ) : (
          <ul className="space-y-1">
            {entries.map((entry) => {
              const Icon = entry.icon;

              return (
                <li key={entry.id} className="flex gap-3 px-2 py-2">
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${entry.iconClass}`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {entry.title}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {entry.description}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] whitespace-nowrap text-slate-400">
                    {entry.timestamp ? formatDateTime(entry.timestamp) : "Now"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
