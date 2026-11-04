"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, Eye, EyeOff, FolderTree, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { PageHeader } from "@/components/admin/ui/page-header";
import { ErrorState, Skeleton } from "@/components/admin/ui/states";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils";
import { categoriesService } from "@/services/admin/categories.service";
import { toast } from "@/store/toast.store";
import type { AdminCategory } from "@/types/category";
import { CategoryAvatar, CategoryStatusBadge } from "./category-avatar";
import { DeleteCategoryDialog } from "./delete-category-dialog";

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0 last:pb-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}

export function CategoryDetailView({ id }: { id: string }) {
  const router = useRouter();
  const [category, setCategory] = useState<AdminCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminCategory | null>(null);

  useEffect(() => {
    let active = true;

    categoriesService
      .get(id)
      .then((result) => {
        if (active) {
          setCategory(result);
          setError(null);
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

  const toggleStatus = async () => {
    if (!category) {
      return;
    }

    const nextStatus = category.status === "active" ? "inactive" : "active";

    setBusy(true);

    try {
      const updated = await categoriesService.updateStatus(category.id, nextStatus);

      setCategory(updated);
      toast.success(
        nextStatus === "active" ? "Category activated" : "Category deactivated",
      );
    } catch (error_) {
      toast.error(getApiErrorMessage(error_));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-5">
        <PageHeader title="Category" />
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            setReloadToken((token) => token + 1);
          }}
        />
      </div>
    );
  }

  if (!category) {
    return (
      <div className="space-y-5">
        <PageHeader title="Category" />
        <div className="grid gap-5 xl:grid-cols-3">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl xl:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={category.name}
        description={
          category.parentPath
            ? `${category.parentPath} › ${category.name}`
            : `Top-level category · /categories/${category.slug}`
        }
        actions={
          <>
            <Link href={`/admin/categories/${category.id}/edit`}>
              <Button variant="secondary">
                <Pencil className="h-4 w-4" aria-hidden />
                Edit
              </Button>
            </Link>
            <Button variant="secondary" onClick={() => void toggleStatus()} loading={busy}>
              {category.status === "active" ? (
                <>
                  <EyeOff className="h-4 w-4" aria-hidden />
                  Deactivate
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" aria-hidden />
                  Activate
                </>
              )}
            </Button>
            <Button variant="danger" onClick={() => setPendingDelete(category)}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5">
          <Card>
            <CardBody className="flex flex-col items-center gap-3 py-6 text-center">
              <CategoryAvatar name={category.name} image={category.image} size="lg" />
              <div>
                <p className="text-sm font-medium text-slate-900">{category.name}</p>
                <p className="font-mono text-xs text-slate-500">/{category.slug}</p>
              </div>
              <CategoryStatusBadge status={category.status} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Catalogue" />
            <CardBody className="pt-0">
              <dl>
                <DetailRow label="Products">
                  <Link href="/admin/products" className="hover:underline">
                    {category.productCount}
                  </Link>
                </DetailRow>
                <DetailRow label="Subcategories">{category.childrenCount}</DetailRow>
                <DetailRow label="Display order">{category.displayOrder}</DetailRow>
                <DetailRow label="Created">{formatDateTime(category.createdAt)}</DetailRow>
                <DetailRow label="Last updated">
                  {formatDateTime(category.updatedAt)}
                </DetailRow>
              </dl>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title="Hierarchy" description="Where this category sits." />
            <CardBody className="pt-0">
              <nav
                aria-label="Category hierarchy"
                className="flex flex-wrap items-center gap-1 text-sm text-slate-600"
              >
                <Link href="/admin/categories" className="hover:underline">
                  All categories
                </Link>
                {category.parent ? (
                  <>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                    <Link
                      href={`/admin/categories/${category.parent.id}`}
                      className="hover:underline"
                    >
                      {category.parent.name}
                    </Link>
                  </>
                ) : null}
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                <span className="font-medium text-slate-900">{category.name}</span>
              </nav>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Description" />
            <CardBody className="pt-0">
              <p className="text-sm whitespace-pre-line text-slate-700">
                {category.description || "No description yet."}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="SEO" />
            <CardBody className="pt-0">
              <dl>
                <DetailRow label="SEO title">{category.seoTitle ?? "—"}</DetailRow>
                <DetailRow label="SEO description">
                  {category.seoDescription ?? "—"}
                </DetailRow>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Subcategories"
              description={
                category.childrenCount === 0
                  ? "This category has no children."
                  : "Children are moved or deleted before this category can be removed."
              }
              action={
                <Link href="/admin/categories">
                  <Button variant="secondary" size="sm">
                    <FolderTree className="h-3.5 w-3.5" aria-hidden />
                    All categories
                  </Button>
                </Link>
              }
            />
            <CardBody className="pt-0 text-sm text-slate-600">
              {category.childrenCount === 0 ? (
                <p>—</p>
              ) : (
                <Link
                  href={`/admin/categories?parentId=${category.id}`}
                  className="font-medium text-slate-800 hover:underline"
                >
                  View the {category.childrenCount} subcategor
                  {category.childrenCount === 1 ? "y" : "ies"}
                </Link>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <DeleteCategoryDialog
        category={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onDeleted={() => router.push("/admin/categories")}
      />
    </div>
  );
}
