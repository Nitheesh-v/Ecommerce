"use client";

import { useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Dialog } from "@/components/admin/ui/dialog";
import { getApiErrorMessage } from "@/lib/api/errors";
import { productsService } from "@/services/admin/products.service";
import { toast } from "@/store/toast.store";
import type { AdminProduct } from "@/types/product";

/**
 * Confirmation for a destructive action.
 *
 * The warning is explicit about what the backend will do: products referenced by
 * orders are archived instead of removed, because deleting them would orphan
 * order history/invoices.
 */
export function DeleteProductDialog({
  product,
  onClose,
  onDeleted,
}: {
  product: AdminProduct | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!product) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const result = await productsService.remove(product.id);

      toast[result.deleted ? "success" : "info"](result.message);
      onDeleted();
      onClose();
    } catch (error_) {
      setError(getApiErrorMessage(error_));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open={product !== null}
      onClose={onClose}
      title="Delete this product?"
      description={
        product
          ? `“${product.name}” will be removed from the catalogue.`
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void confirm()} loading={deleting}>
            Delete product
          </Button>
        </>
      }
    >
      <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        Products that appear in existing orders are <strong>archived</strong>, not
        deleted, so order history and invoices stay intact. Archive it yourself if
        you only want it hidden from the storefront.
      </p>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
