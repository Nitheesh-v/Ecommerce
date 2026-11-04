import { Badge } from "@/components/admin/ui/badge";
import type { ProductStatus, StockStatus } from "@/types/product";

const STATUS_TONES = {
  published: "success",
  draft: "warning",
  archived: "neutral",
} as const;

const STATUS_LABELS: Record<ProductStatus, string> = {
  published: "Published",
  draft: "Draft",
  archived: "Archived",
};

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

const STOCK_TONES = {
  in: "success",
  low: "warning",
  out: "danger",
} as const;

const STOCK_LABELS: Record<StockStatus, string> = {
  in: "In stock",
  low: "Low stock",
  out: "Out of stock",
};

export function StockBadge({
  status,
  stock,
}: {
  status: StockStatus;
  stock: number;
}) {
  return (
    <Badge tone={STOCK_TONES[status]}>
      {status === "out" ? "Out of stock" : `${stock} · ${STOCK_LABELS[status]}`}
    </Badge>
  );
}
