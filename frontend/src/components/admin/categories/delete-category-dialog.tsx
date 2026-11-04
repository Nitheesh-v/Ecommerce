"use client";

import { useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Dialog } from "@/components/admin/ui/dialog";
import { getApiErrorMessage } from "@/lib/api/errors";
import { categoriesService } from "@/services/admin/categories.service";
import { toast } from "@/store/toast.store";
import type { AdminCategory } from "@/types/category";

/**
 * Deletion guard, explained up front.
 *
 * The API refuses to delete a category that still has subcategories or products
 * (409); the dialog shows that message verbatim so the admin knows what to fix.
 */
export function DeleteCategoryDialog({
  category,
  onClose,
  onDeleted,
}: {
  category: AdminCategory | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!category) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      await categoriesService.remove(category.id);
      toast.success(`“${category.name}” deleted`);
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
      open={category !== null}
      onClose={onClose}
      title="Delete this category?"
      description={
        category ? `“${category.name}” will be removed permanently.` : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void confirm()} loading={deleting}>
            Delete category
          </Button>
        </>
      }
    >
      <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        A category can only be deleted when it has <strong>no subcategories</strong>{" "}
        and <strong>no products</strong>. Otherwise move or delete its children and
        reassign its products first — or simply deactivate it.
      </p>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
