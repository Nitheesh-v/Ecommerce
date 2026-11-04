"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { PageHeader } from "@/components/admin/ui/page-header";
import { ErrorState } from "@/components/admin/ui/states";
import { getApiErrorMessage } from "@/lib/api/errors";
import { categoriesService } from "@/services/admin/categories.service";
import { productsService } from "@/services/admin/products.service";
import type { AdminProduct, Category } from "@/types/product";
import { ProductForm } from "./product-form";
import { ProductFormSkeleton } from "./product-form-skeleton";

interface Loaded {
  product: AdminProduct;
  categories: Category[];
}

export function ProductEditView({ id }: { id: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    Promise.all([productsService.get(id), categoriesService.listAll()])
      .then(([product, categories]) => {
        if (active) {
          setLoaded({ product, categories });
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
        title={loaded ? `Edit “${loaded.product.name}” ` : "Edit product"}
        description={
          loaded
            ? `SKU ${loaded.product.sku} · last updated ${new Date(
                loaded.product.updatedAt,
              ).toLocaleString("en-IN")}`
            : undefined
        }
        actions={
          loaded ? (
            <Link href={`/admin/products/${loaded.product.id}`}>
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
        <ProductFormSkeleton />
      ) : (
        <ProductForm
          mode="edit"
          product={loaded.product}
          categories={loaded.categories}
        />
      )}
    </div>
  );
}
