"use client";

import Link from "next/link";
import { FolderTree, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Card } from "@/components/admin/ui/card";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Pagination } from "@/components/admin/ui/pagination";
import { EmptyState, ErrorState } from "@/components/admin/ui/states";
import { useCategoryList } from "@/hooks/use-category-list";
import { getApiErrorMessage } from "@/lib/api/errors";
import { categoriesService } from "@/services/admin/categories.service";
import { toast } from "@/store/toast.store";
import type { AdminCategory, CategorySortField } from "@/types/category";
import { CategoriesTable } from "./categories-table";
import { CategoryFiltersBar } from "./category-filters";
import { DeleteCategoryDialog } from "./delete-category-dialog";

export function CategoriesView() {
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
  } = useCategoryList();

  // Full list for the "parent category" filter (indented tree).
  const [allCategories, setAllCategories] = useState<AdminCategory[]>([]);
  const [pendingDelete, setPendingDelete] = useState<AdminCategory | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Deep link from the detail page (`?parentId=<id>`). Read from the URL once,
  // after mount, so the page keeps rendering as a client console screen.
  useEffect(() => {
    const parentId = new URLSearchParams(window.location.search).get("parentId");

    if (parentId) {
      update({ parentId });
    }
  }, [update]);

  useEffect(() => {
    categoriesService
      .listAll()
      .then(setAllCategories)
      .catch(() => {
        // The filter degrades to "All levels"; the list still works.
      });
  }, []);

  const onSort = (field: CategorySortField) => {
    update({
      sortBy: field,
      sortOrder:
        filters.sortBy === field && filters.sortOrder === "asc" ? "desc" : "asc",
    });
  };

  const onToggleStatus = async (category: AdminCategory) => {
    const nextStatus = category.status === "active" ? "inactive" : "active";

    setBusyId(category.id);

    try {
      await categoriesService.updateStatus(category.id, nextStatus);
      toast.success(
        nextStatus === "active"
          ? `“${category.name}” is now active`
          : `“${category.name}” is now inactive`,
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
        title="Categories"
        description="Organise the catalogue into departments, categories and subcategories."
        actions={
          <Link href="/admin/categories/create">
            <Button>
              <Plus className="h-4 w-4" aria-hidden />
              Add category
            </Button>
          </Link>
        }
      />

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      <Card className="overflow-hidden">
        <CategoryFiltersBar
          filters={filters}
          categories={allCategories}
          onChange={update}
          onReset={reset}
          hasActiveFilters={hasActiveFilters}
          total={meta?.total ?? 0}
        />

        {!loading && items.length === 0 && meta !== null && hasActiveFilters ? (
          <div className="p-5">
            <EmptyState
              icon={FolderTree}
              title="No categories match these filters"
              description="Try a different search term, status or parent."
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
              icon={FolderTree}
              title="No categories yet"
              description="Create your first category, then assign products to it."
              action={
                <Link href="/admin/categories/create" className="mt-2">
                  <Button size="sm">
                    <Plus className="h-4 w-4" aria-hidden />
                    Add category
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          <CategoriesTable
            items={items}
            filters={filters}
            loading={loading}
            busyId={busyId}
            onSort={onSort}
            onDelete={setPendingDelete}
            onToggleStatus={(category) => void onToggleStatus(category)}
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

      <DeleteCategoryDialog
        category={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onDeleted={refresh}
      />
    </div>
  );
}
