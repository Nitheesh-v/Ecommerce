"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { ErrorState } from "@/components/admin/ui/states";
import { getApiErrorMessage } from "@/lib/api/errors";
import { categoriesService } from "@/services/admin/categories.service";
import type { Category } from "@/types/product";
import { ProductForm } from "./product-form";
import { ProductFormSkeleton } from "./product-form-skeleton";

export function ProductCreateView() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    categoriesService
      .list()
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
        title="Add product"
        description="Draft the details now — nothing is visible to customers until you publish."
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
        <ProductFormSkeleton />
      ) : (
        <ProductForm mode="create" categories={categories} />
      )}
    </div>
  );
}
