"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { ErrorState } from "@/components/admin/ui/states";
import { getApiErrorMessage } from "@/lib/api/errors";
import { categoriesService } from "@/services/admin/categories.service";
import type { AdminCategory } from "@/types/category";
import { CategoryForm } from "./category-form";
import { CategoryFormSkeleton } from "./category-form-skeleton";

export function CategoryCreateView() {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    categoriesService
      .listAll()
      .then((result) => {
        if (active) {
          setCategories(result);
        }
      })
      .catch((error_: unknown) => {
        if (active) {
          setError(getApiErrorMessage(error_));
        }
      });

    return () => {
      active = false;
    };
  }, [reloadToken]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Add category"
        description="Create a department, a category, or a subcategory under an existing one."
      />

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            setReloadToken((token) => token + 1);
          }}
        />
      ) : categories === null ? (
        <CategoryFormSkeleton />
      ) : (
        <CategoryForm mode="create" categories={categories} />
      )}
    </div>
  );
}
