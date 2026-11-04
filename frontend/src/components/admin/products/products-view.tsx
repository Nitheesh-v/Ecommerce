"use client";

import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Card } from "@/components/admin/ui/card";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Pagination } from "@/components/admin/ui/pagination";
import { EmptyState, ErrorState } from "@/components/admin/ui/states";
import { useProductList } from "@/hooks/use-product-list";
import { getApiErrorMessage } from "@/lib/api/errors";
import { categoriesService } from "@/services/admin/categories.service";
import { productsService } from "@/services/admin/products.service";
import { toast } from "@/store/toast.store";
import type { AdminProduct, Category, ProductSortField } from "@/types/product";
import { DeleteProductDialog } from "./delete-product-dialog";
import { ProductFiltersBar } from "./product-filters";
import { ProductsTable } from "./products-table";

export function ProductsView() {
  const {
    filters,
    update,
    reset,
    refresh,
    items,
    meta,
    error,
    loading,
    hasActiveFilters,
  } = useProductList();

  const [categories, setCategories] = useState<Category[]>([]);
  const [pendingDelete, setPendingDelete] = useState<AdminProduct | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    categoriesService
      .listAll()
      .then(setCategories)
      .catch(() => {
        // The filter bar degrades to "All categories"; the list still works.
      });
  }, []);

  const onSort = (field: ProductSortField) => {
    update({
      sortBy: field,
      sortOrder:
        filters.sortBy === field && filters.sortOrder === "desc" ? "asc" : "desc",
    });
  };

  const onToggleStatus = async (product: AdminProduct) => {
    const nextStatus = product.status === "published" ? "draft" : "published";

    setBusyId(product.id);

    try {
      await productsService.updateStatus(product.id, nextStatus);
      toast.success(
        nextStatus === "published"
          ? `“${product.name}” is now published`
          : `“${product.name}” moved to draft`,
      );
      refresh();
    } catch (error_) {
      toast.error(getApiErrorMessage(error_));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Products"
        description="Create, price and publish the items your customers can buy."
        actions={
          <Link href="/admin/products/create">
            <Button>
              <Plus className="h-4 w-4" aria-hidden />
              Add product
            </Button>
          </Link>
        }
      />

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      <Card className="overflow-hidden">
        <ProductFiltersBar
          filters={filters}
          categories={categories}
          onChange={update}
          onReset={reset}
          hasActiveFilters={hasActiveFilters}
          total={meta?.total ?? 0}
        />

        {!loading && items.length === 0 && meta !== null && hasActiveFilters ? (
          <div className="p-5">
            <EmptyState
              icon={Package}
              title="No products match these filters"
              description="Try a different search term, or clear the filters to see the whole catalogue."
              action={
                <Button variant="secondary" size="sm" onClick={reset} className="mt-2">
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : !loading && items.length === 0 && meta !== null ? (
          <div className="p-5">
            <EmptyState
              icon={Package}
              title="No products yet"
              description="Add your first product to start building the catalogue."
              action={
                <Link href="/admin/products/create" className="mt-2">
                  <Button size="sm">
                    <Plus className="h-4 w-4" aria-hidden />
                    Add product
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          <ProductsTable
            items={items}
            filters={filters}
            loading={loading}
            busyId={busyId}
            onSort={onSort}
            onDelete={setPendingDelete}
            onToggleStatus={(product) => void onToggleStatus(product)}
          />
        )}

        {meta ? (
          <Pagination
            meta={meta}
            disabled={loading}
            onPageChange={(page) => update({ page })}
          />
        ) : null}
      </Card>

      <DeleteProductDialog
        product={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onDeleted={refresh}
      />
    </div>
  );
}
