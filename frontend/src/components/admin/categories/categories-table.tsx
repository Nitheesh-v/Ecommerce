"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/admin/ui/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/admin/ui/table";
import type { CategoryFilters } from "@/hooks/use-category-list";
import { cn, formatDate } from "@/lib/utils";
import type { AdminCategory, CategorySortField } from "@/types/category";
import { CategoryAvatar, CategoryStatusBadge } from "./category-avatar";

const COLUMNS = 8;

const iconButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-slate-500 transition-colors hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900";

function SortButton({
  label,
  field,
  filters,
  onSort,
}: {
  label: string;
  field: CategorySortField;
  filters: CategoryFilters;
  onSort: (field: CategorySortField) => void;
}) {
  const active = filters.sortBy === field;

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cn(
        "inline-flex items-center gap-1 transition-colors hover:text-slate-800",
        active && "text-slate-900",
      )}
      aria-label={`Sort by ${label}`}
    >
      {label}
      {active ? (
        filters.sortOrder === "asc" ? (
          <ArrowUp className="h-3 w-3" aria-hidden />
        ) : (
          <ArrowDown className="h-3 w-3" aria-hidden />
        )
      ) : null}
    </button>
  );
}

export function CategoriesTable({
  items,
  filters,
  loading,
  onSort,
  onDelete,
  onToggleStatus,
  busyId,
}: {
  items: AdminCategory[];
  filters: CategoryFilters;
  loading: boolean;
  onSort: (field: CategorySortField) => void;
  onDelete: (category: AdminCategory) => void;
  onToggleStatus: (category: AdminCategory) => void;
  busyId: string | null;
}) {
  return (
    <Table className="min-w-[64rem]">
      <TableHead>
        <TableHeaderCell className="w-14">Image</TableHeaderCell>
        <TableHeaderCell>
          <SortButton label="Category" field="name" filters={filters} onSort={onSort} />
        </TableHeaderCell>
        <TableHeaderCell>Slug</TableHeaderCell>
        <TableHeaderCell>Parent</TableHeaderCell>
        <TableHeaderCell className="text-right">Products</TableHeaderCell>
        <TableHeaderCell>Status</TableHeaderCell>
        <TableHeaderCell>
          <SortButton
            label="Created"
            field="createdAt"
            filters={filters}
            onSort={onSort}
          />
        </TableHeaderCell>
        <TableHeaderCell className="text-right">Actions</TableHeaderCell>
      </TableHead>

      <TableBody>
        {loading && items.length === 0
          ? Array.from({ length: 6 }).map((_, index) => (
              <TableRow key={`skeleton-${index}`}>
                <TableCell>
                  <Skeleton className="h-10 w-10 rounded-lg" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="mt-1.5 h-3 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="ml-auto h-3 w-8" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="ml-auto h-6 w-24" />
                </TableCell>
              </TableRow>
            ))
          : items.map((category) => {
              const busy = busyId === category.id;

              return (
                <TableRow key={category.id} className={cn(busy && "opacity-60")}>
                  <TableCell>
                    <CategoryAvatar name={category.name} image={category.image} />
                  </TableCell>

                  <TableCell className="max-w-[18rem]">
                    <Link
                      href={`/admin/categories/${category.id}`}
                      className="block truncate font-medium text-slate-900 hover:underline"
                    >
                      {category.name}
                    </Link>
                    <span className="text-xs text-slate-500">
                      {category.childrenCount > 0
                        ? `${category.childrenCount} subcategor${category.childrenCount === 1 ? "y" : "ies"}`
                        : "No subcategories"}
                    </span>
                  </TableCell>

                  <TableCell className="font-mono text-xs text-slate-600">
                    {category.slug}
                  </TableCell>

                  <TableCell className="text-slate-600">
                    {category.parent ? (
                      <Link
                        href={`/admin/categories/${category.parent.id}`}
                        className="hover:underline"
                      >
                        {category.parent.name}
                      </Link>
                    ) : (
                      <span className="text-slate-400">Top level</span>
                    )}
                  </TableCell>

                  <TableCell className="text-right tabular-nums text-slate-700">
                    {category.productCount}
                  </TableCell>

                  <TableCell>
                    <CategoryStatusBadge status={category.status} />
                  </TableCell>

                  <TableCell className="text-xs whitespace-nowrap text-slate-500">
                    {formatDate(category.createdAt)}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/categories/${category.id}`}
                        className={iconButton}
                        title="View category"
                        aria-label={`View ${category.name}`}
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                      </Link>
                      <Link
                        href={`/admin/categories/${category.id}/edit`}
                        className={iconButton}
                        title="Edit category"
                        aria-label={`Edit ${category.name}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Link>
                      <button
                        type="button"
                        onClick={() => onToggleStatus(category)}
                        disabled={busy}
                        className={iconButton}
                        title={
                          category.status === "active" ? "Deactivate" : "Activate"
                        }
                        aria-label={
                          category.status === "active"
                            ? `Deactivate ${category.name}`
                            : `Activate ${category.name}`
                        }
                      >
                        {category.status === "active" ? (
                          <EyeOff className="h-4 w-4" aria-hidden />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(category)}
                        disabled={busy}
                        className={cn(iconButton, "hover:text-rose-600")}
                        title="Delete category"
                        aria-label={`Delete ${category.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}

        {!loading && items.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={COLUMNS}
              className="py-10 text-center text-sm text-slate-500"
            >
              Nothing to show yet.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
