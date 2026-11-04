import { AlertTriangle, Package, UserPlus } from "lucide-react";
import { Badge } from "@/components/admin/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { EmptyState } from "@/components/admin/ui/states";
import { formatCurrency, formatDate, initialsOf } from "@/lib/utils";
import type {
  LowStockProduct,
  RecentCustomer,
  TopProduct,
} from "@/types/admin";

export function TopProductsCard({ products }: { products: TopProduct[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader title="Top products" description="By revenue in this period" />
      <CardBody className="px-3 py-2">
        {products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No product sales yet"
            description="Best sellers are ranked from paid order line items."
            className="border-0"
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {products.map((product, index) => (
              <li
                key={product.id}
                className="flex items-center gap-3 px-2 py-2.5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-semibold text-slate-600">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {product.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {product.unitsSold} sold
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium text-slate-900 tabular-nums">
                  {formatCurrency(product.revenue)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function LowStockCard({ items }: { items: LowStockProduct[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader
        title="Low stock alerts"
        description="At or below the reorder threshold"
        action={
          items.length > 0 ? (
            <Badge tone="warning">{items.length}</Badge>
          ) : null
        }
      />
      <CardBody className="px-3 py-2">
        {items.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="Stock levels look healthy"
            description="Nothing is at or below its low-stock threshold."
            className="border-0"
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {item.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    SKU {item.sku} · threshold {item.lowStockThreshold}
                  </p>
                </div>
                <Badge tone={item.stock === 0 ? "danger" : "warning"}>
                  {item.stock === 0 ? "Out of stock" : `${item.stock} left`}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function RecentCustomersCard({
  customers,
}: {
  customers: RecentCustomer[];
}) {
  return (
    <Card className="min-w-0">
      <CardHeader title="New customers" description="Most recent sign-ups" />
      <CardBody className="px-3 py-2">
        {customers.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No customers yet"
            description="Accounts created in this period appear here."
            className="border-0"
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {customers.map((customer) => (
              <li key={customer.id} className="flex items-center gap-3 px-2 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {initialsOf(customer.name) || "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {customer.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {customer.email}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {formatDate(customer.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
