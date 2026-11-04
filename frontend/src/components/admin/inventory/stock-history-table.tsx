"use client";

import { Badge } from "@/components/admin/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/admin/ui/table";
import { Skeleton } from "@/components/admin/ui/states";
import { cn, formatDateTime } from "@/lib/utils";
import {
  ADJUSTMENT_REASON_LABELS,
  MOVEMENT_TYPE_LABELS,
  type MovementType,
  type StockMovement,
} from "@/types/inventory";

const COLUMNS = [
  "Product",
  "SKU",
  "Movement",
  "Previous",
  "Changed",
  "New",
  "Reason",
  "Reference",
  "Performed by",
  "Date",
];

const MOVEMENT_TONES: Record<MovementType, "neutral" | "info" | "success" | "warning" | "danger"> = {
  initial: "info",
  adjustment: "neutral",
  order: "warning",
  cancellation: "success",
  return: "success",
  correction: "info",
};

/**
 * Read-only audit trail.
 *
 * There is no edit or delete action here by design: the backend exposes no such
 * route, because a stock history that can be rewritten cannot be audited.
 */
export function StockHistoryTable({
  items,
  loading,
}: {
  items: StockMovement[];
  loading: boolean;
}) {
  return (
    <Table className="min-w-[64rem]">
      <TableHead>
        {COLUMNS.map((column) => (
          <TableHeaderCell key={column}>{column}</TableHeaderCell>
        ))}
      </TableHead>

      <TableBody>
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <TableRow key={`skeleton-${index}`}>
                {COLUMNS.map((column) => (
                  <TableCell key={column}>
                    <Skeleton className="h-3 w-20" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          : items.map((movement) => (
              <TableRow key={movement.id}>
                <TableCell className="max-w-56">
                  <span className="line-clamp-1 font-medium text-slate-900">
                    {movement.productName}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-600">
                  {movement.sku}
                </TableCell>
                <TableCell>
                  <Badge tone={MOVEMENT_TONES[movement.type]}>
                    {MOVEMENT_TYPE_LABELS[movement.type]}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums text-slate-600">
                  {movement.previousQuantity}
                </TableCell>
                <TableCell
                  className={cn(
                    "font-semibold tabular-nums",
                    movement.changedQuantity > 0 ? "text-emerald-600" : "text-rose-600",
                  )}
                >
                  {movement.changedQuantity > 0 ? "+" : ""}
                  {movement.changedQuantity}
                </TableCell>
                <TableCell className="font-semibold text-slate-900 tabular-nums">
                  {movement.newQuantity}
                </TableCell>
                <TableCell className="text-slate-600">
                  {movement.reason ? ADJUSTMENT_REASON_LABELS[movement.reason] : "—"}
                </TableCell>
                <TableCell className="max-w-40 font-mono text-xs text-slate-500">
                  <span className="line-clamp-1">{movement.referenceId ?? "—"}</span>
                </TableCell>
                <TableCell className="text-xs text-slate-600">
                  {movement.performedBy?.email ?? (
                    <span className="text-slate-400">System</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-slate-500">
                  {formatDateTime(movement.createdAt)}
                </TableCell>
              </TableRow>
            ))}
      </TableBody>
    </Table>
  );
}
