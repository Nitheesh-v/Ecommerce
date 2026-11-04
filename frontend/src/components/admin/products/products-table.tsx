"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  Eye,
  EyeOff,
  ImageOff,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { Skeleton } from "@/components/admin/ui/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/admin/ui/table";
import type { ProductFilters } from "@/hooks/use-product-list";
import { resolveImageUrl } from "@/lib/images";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { AdminProduct, ProductSortField } from "@/types/product";
import { ProductStatusBadge, StockBadge } from "./product-badges";

const COLUMNS = 9;

function SortButton({
  label,
  field,
  filters,
  onSort,
}: {
  label: string;
  field: ProductSortField;
  filters: ProductFilters;
  onSort: (field: ProductSortField) => void;
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

const iconButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-slate-500 transition-colors hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900";

export function ProductsTable({
  items,
  filters,
  loading,
  onSort,
  onDelete,
  onToggleStatus,
  busyId,
}: {
  items: AdminProduct[];
  filters: ProductFilters;
  loading: boolean;
  onSort: (field: ProductSortField) => void;
  onDelete: (product: AdminProduct) => void;
  onToggleStatus: (product: AdminProduct) => void;
  busyId: string | null;
}) {
  return (
    <Table className="min-w-[64rem]">
      <TableHead>
        <TableHeaderCell className="w-14">Image</TableHeaderCell>
        <TableHeaderCell>
          <SortButton label="Product" field="name" filters={filters} onSort={onSort} />
        </TableHeaderCell>
        <TableHeaderCell>SKU</TableHeaderCell>
        <TableHeaderCell>Category</TableHeaderCell>
        <TableHeaderCell className="text-right">
          <SortButton label="Price" field="price" filters={filters} onSort={onSort} />
        </TableHeaderCell>
        <TableHeaderCell className="text-right">
          <SortButton label="Stock" field="stock" filters={filters} onSort={onSort} />
        </TableHeaderCell>
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
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="mt-1.5 h-3 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="ml-auto h-3 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="ml-auto h-3 w-12" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-20 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="ml-auto h-6 w-24" />
                </TableCell>
              </TableRow>
            ))
          : items.map((product) => {
              const image = resolveImageUrl(
                product.images.find((item) => item.isPrimary)?.url ??
                  product.images[0]?.url,
              );
              const busy = busyId === product.id;

              return (
                <TableRow key={product.id} className={cn(busy && "opacity-60")}>
                  <TableCell>
                    <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                      {image ? (
                        // Plain <img>: product images can live on any admin-configured
                        // host (local /uploads or a Cloudinary account), and a 40px
                        // thumbnail gains nothing from the optimizer.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={image}
                          alt={product.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageOff className="h-4 w-4 text-slate-300" aria-hidden />
                      )}
                    </span>
                  </TableCell>

                  <TableCell className="max-w-[18rem]">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="flex items-center gap-1.5 font-medium text-slate-900 hover:underline"
                    >
                      <span className="truncate">{product.name}</span>
                      {product.isFeatured ? (
                        <Star
                          className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400"
                          aria-label="Featured"
                        />
                      ) : null}
                    </Link>
                    <span className="block truncate text-xs text-slate-500">
                      /{product.slug}
                    </span>
                  </TableCell>

                  <TableCell className="font-mono text-xs text-slate-600">
                    {product.sku}
                  </TableCell>

                  <TableCell className="text-slate-600">
                    {product.category?.name ?? "—"}
                  </TableCell>

                  <TableCell className="text-right">
                    {product.salePrice ? (
                      <span className="flex flex-col items-end">
                        <span className="font-medium text-slate-900 tabular-nums">
                          {formatCurrency(product.salePrice)}
                        </span>
                        <span className="text-xs text-slate-400 line-through tabular-nums">
                          {formatCurrency(product.price)}
                        </span>
                      </span>
                    ) : (
                      <span className="font-medium text-slate-900 tabular-nums">
                        {formatCurrency(product.price)}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <StockBadge status={product.stockStatus} stock={product.stock} />
                  </TableCell>

                  <TableCell>
                    <ProductStatusBadge status={product.status} />
                  </TableCell>

                  <TableCell className="text-xs whitespace-nowrap text-slate-500">
                    {formatDate(product.createdAt)}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className={iconButton}
                        title="View product"
                        aria-label={`View ${product.name}`}
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                      </Link>
                      <Link
                        href={`/admin/products/${product.id}/edit`}
                        className={iconButton}
                        title="Edit product"
                        aria-label={`Edit ${product.name}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Link>
                      <button
                        type="button"
                        onClick={() => onToggleStatus(product)}
                        disabled={busy}
                        className={iconButton}
                        title={
                          product.status === "published"
                            ? "Unpublish (move to draft)"
                            : "Publish"
                        }
                        aria-label={
                          product.status === "published"
                            ? `Unpublish ${product.name}`
                            : `Publish ${product.name}`
                        }
                      >
                        {product.status === "published" ? (
                          <EyeOff className="h-4 w-4" aria-hidden />
                        ) : product.status === "archived" ? (
                          <Archive className="h-4 w-4" aria-hidden />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(product)}
                        disabled={busy}
                        className={cn(iconButton, "hover:text-rose-600")}
                        title="Delete product"
                        aria-label={`Delete ${product.name}`}
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
            <TableCell colSpan={COLUMNS} className="py-10 text-center text-sm text-slate-500">
              Nothing to show yet.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
