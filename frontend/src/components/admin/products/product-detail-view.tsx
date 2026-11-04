"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Archive,
  Eye,
  EyeOff,
  ImageOff,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { PageHeader } from "@/components/admin/ui/page-header";
import { ErrorState, Skeleton } from "@/components/admin/ui/states";
import { getApiErrorMessage } from "@/lib/api/errors";
import { resolveImageUrl } from "@/lib/images";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import { productsService } from "@/services/admin/products.service";
import { toast } from "@/store/toast.store";
import type { AdminProduct } from "@/types/product";
import { DeleteProductDialog } from "./delete-product-dialog";
import { ProductStatusBadge, StockBadge } from "./product-badges";

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

export function ProductDetailView({ id }: { id: string }) {
  const router = useRouter();
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [activeImage, setActiveImage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminProduct | null>(null);

  useEffect(() => {
    let active = true;

    productsService
      .get(id)
      .then((result) => {
        if (active) {
          setProduct(result);
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
    if (!product) {
      return;
    }

    const nextStatus = product.status === "published" ? "draft" : "published";

    setBusy(true);

    try {
      const updated = await productsService.updateStatus(product.id, nextStatus);

      setProduct(updated);
      toast.success(
        nextStatus === "published" ? "Product published" : "Product moved to draft",
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
        <PageHeader title="Product" />
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

  if (!product) {
    return (
      <div className="space-y-5">
        <PageHeader title="Product" />
        <div className="grid gap-5 xl:grid-cols-3">
          <Skeleton className="aspect-square w-full rounded-xl xl:col-span-1" />
          <Skeleton className="h-64 w-full rounded-xl xl:col-span-2" />
        </div>
      </div>
    );
  }

  const gallery = product.images;
  const imageIndex = Math.min(activeImage, Math.max(gallery.length - 1, 0));
  const mainImage = resolveImageUrl(gallery[imageIndex]?.url);
  const margin =
    product.costPrice && product.effectivePrice
      ? Math.round(((product.effectivePrice - product.costPrice) / product.effectivePrice) * 100)
      : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={product.name}
        description={`SKU ${product.sku} · /products/${product.slug}`}
        actions={
          <>
            <Link href={`/admin/products/${product.id}/edit`}>
              <Button variant="secondary">
                <Pencil className="h-4 w-4" aria-hidden />
                Edit
              </Button>
            </Link>
            <Button
              variant="secondary"
              onClick={() => void toggleStatus()}
              loading={busy}
            >
              {product.status === "published" ? (
                <>
                  <EyeOff className="h-4 w-4" aria-hidden />
                  Unpublish
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" aria-hidden />
                  Publish
                </>
              )}
            </Button>
            <Button variant="danger" onClick={() => setPendingDelete(product)}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="flex aspect-square items-center justify-center bg-slate-50">
              {mainImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mainImage}
                  alt={gallery[imageIndex]?.alt ?? product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <ImageOff className="h-6 w-6" aria-hidden />
                  <span className="text-xs">No images uploaded</span>
                </div>
              )}
            </div>

            {gallery.length > 1 ? (
              <CardBody className="flex flex-wrap gap-2">
                {gallery.map((image, index) => {
                  const src = resolveImageUrl(image.url);

                  return (
                    <button
                      key={`${image.url}-${index}`}
                      type="button"
                      onClick={() => setActiveImage(index)}
                      aria-label={`Show image ${index + 1}`}
                      aria-current={index === imageIndex}
                      className={cn(
                        "h-14 w-14 overflow-hidden rounded-lg border-2 bg-slate-50 transition-colors",
                        index === imageIndex
                          ? "border-slate-900"
                          : "border-transparent hover:border-slate-300",
                      )}
                    >
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Inventory" />
            <CardBody className="pt-0">
              <dl>
                <DetailRow label="Stock on hand">{product.stock}</DetailRow>
                <DetailRow label="Low stock threshold">
                  {product.lowStockThreshold}
                </DetailRow>
                <DetailRow label="Availability">
                  <StockBadge status={product.stockStatus} stock={product.stock} />
                </DetailRow>
              </dl>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader
              title="Overview"
              action={<ProductStatusBadge status={product.status} />}
            />
            <CardBody className="pt-0">
              <dl>
                <DetailRow label="Slug">
                  <span className="font-mono text-xs text-slate-600">
                    /{product.slug}
                  </span>
                </DetailRow>
                <DetailRow label="SKU">
                  <span className="font-mono text-xs">{product.sku}</span>
                </DetailRow>
                <DetailRow label="Category">{product.category?.name ?? "—"}</DetailRow>
                <DetailRow label="Brand">{product.brand ?? "—"}</DetailRow>
                <DetailRow label="Featured">
                  {product.isFeatured ? (
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                      Featured
                    </span>
                  ) : (
                    <span className="text-slate-500">Not featured</span>
                  )}
                </DetailRow>
                <DetailRow label="Created">{formatDateTime(product.createdAt)}</DetailRow>
                <DetailRow label="Last updated">
                  {formatDateTime(product.updatedAt)}
                </DetailRow>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Pricing"
              description="Cost price is internal — it never reaches the storefront API."
            />
            <CardBody className="pt-0">
              <dl>
                <DetailRow label="Regular price">{formatCurrency(product.price)}</DetailRow>
                <DetailRow label="Sale price">
                  {product.salePrice ? formatCurrency(product.salePrice) : "—"}
                </DetailRow>
                <DetailRow label="Selling price">
                  {formatCurrency(product.effectivePrice)}
                </DetailRow>
                <DetailRow label="Cost price">
                  {product.costPrice ? formatCurrency(product.costPrice) : "—"}
                </DetailRow>
                <DetailRow label="Margin">
                  {margin === null ? "—" : `${margin}%`}
                </DetailRow>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Description" />
            <CardBody className="space-y-3 pt-0">
              {product.shortDescription ? (
                <p className="text-sm text-slate-600 italic">
                  {product.shortDescription}
                </p>
              ) : null}
              <p className="text-sm whitespace-pre-line text-slate-700">
                {product.description}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="SEO" />
            <CardBody className="pt-0">
              <dl>
                <DetailRow label="SEO title">{product.seoTitle ?? "—"}</DetailRow>
                <DetailRow label="SEO description">
                  {product.seoDescription ?? "—"}
                </DetailRow>
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>

      {product.status === "archived" ? (
        <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <Archive className="h-4 w-4" aria-hidden />
          This product is archived: it is hidden from the storefront and cannot be
          purchased, but its order history is intact.
        </p>
      ) : null}

      <DeleteProductDialog
        product={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onDeleted={() => router.push("/admin/products")}
      />
    </div>
  );
}
