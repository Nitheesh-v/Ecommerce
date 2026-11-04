"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { PageHeader } from "@/components/admin/ui/page-header";
import { ErrorState } from "@/components/admin/ui/states";
import { getApiErrorMessage } from "@/lib/api/errors";
import { categoriesService } from "@/services/admin/categories.service";
import type { AdminCategory } from "@/types/category";
import { CategoryForm } from "./category-form";
import { CategoryFormSkeleton } from "./category-form-skeleton";

interface Loaded {
  category: AdminCategory;
  categories: AdminCategory[];
}

export function CategoryEditView({ id }: { id: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    Promise.all([categoriesService.get(id), categoriesService.listAll()])
      .then(([category, categories]) => {
        if (active) {
          setLoaded({ category, categories });
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
  }, [id, reloadToken]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={loaded ? `Edit “${loaded.category.name}”` : "Edit category"}
        description={
          loaded
            ? `${loaded.category.parentPath || "Top level"} · ${loaded.category.productCount} product${
                loaded.category.productCount === 1 ? "" : "s"
              }`
            : undefined
        }
        actions={
          loaded ? (
            <Link href={`/admin/categories/${loaded.category.id}`}>
              <Button variant="secondary">
                <ExternalLink className="h-4 w-4" aria-hidden />
                View details
              </Button>
            </Link>
          ) : null
        }
      />

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            setReloadToken((token) => token + 1);
          }}
        />
      ) : loaded === null ? (
        <CategoryFormSkeleton />
      ) : (
        <CategoryForm
          mode="edit"
          category={loaded.category}
          categories={loaded.categories}
        />
      )}
    </div>
  );
}
