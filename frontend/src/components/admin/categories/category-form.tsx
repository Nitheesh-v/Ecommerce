"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/admin/ui/button";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { Field, Input } from "@/components/admin/ui/input";
import { Select, Textarea } from "@/components/admin/ui/select";
import { getApiErrorMessage } from "@/lib/api/errors";
import { slugify } from "@/lib/utils";
import { categoriesService, descendantIdsOf } from "@/services/admin/categories.service";
import { toast } from "@/store/toast.store";
import type {
  AdminCategory,
  CategoryImage,
  CategoryWritePayload,
} from "@/types/category";
import { CategoryImageField } from "./category-image-field";
import { CategoryTreeSelect } from "./category-tree-select";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be 80 characters or fewer"),
  slug: z
    .string()
    .trim()
    .max(100, "Slug must be 100 characters or fewer")
    .refine(
      (value) => value === "" || SLUG_PATTERN.test(value),
      "Use lowercase letters, numbers and single hyphens (e.g. mens-clothing)",
    ),
  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or fewer")
    .optional(),
  parentId: z.string(),
  displayOrder: z
    .string()
    .trim()
    .refine((value) => /^\d+$/.test(value), "Display order must be a whole number")
    .refine((value) => Number(value) <= 9999, "Display order must be 9999 or less"),
  status: z.enum(["active", "inactive"]),
  seoTitle: z.string().trim().max(70, "SEO title must be 70 characters or fewer").optional(),
  seoDescription: z
    .string()
    .trim()
    .max(160, "SEO description must be 160 characters or fewer")
    .optional(),
});

type FormValues = z.infer<typeof schema>;

function defaultValuesFor(category?: AdminCategory): FormValues {
  return {
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    description: category?.description ?? "",
    parentId: category?.parentId ?? "",
    displayOrder: String(category?.displayOrder ?? 0),
    status: category?.status ?? "active",
    seoTitle: category?.seoTitle ?? "",
    seoDescription: category?.seoDescription ?? "",
  };
}

function buildPayload(
  values: FormValues,
  image: CategoryImage | null,
): CategoryWritePayload {
  return {
    name: values.name.trim(),
    slug: values.slug.trim() === "" ? undefined : values.slug.trim(),
    description: values.description?.trim() || undefined,
    image,
    parentId: values.parentId === "" ? null : values.parentId,
    displayOrder: Number(values.displayOrder),
    status: values.status,
    seoTitle: values.seoTitle?.trim() || undefined,
    seoDescription: values.seoDescription?.trim() || undefined,
  };
}

/**
 * Create/edit form shared by both routes.
 *
 * The parent picker excludes the category itself and every descendant, which is
 * what stops a cycle at the source (the API enforces it again — the UI is not a
 * security boundary).
 */
export function CategoryForm({
  mode,
  category,
  categories,
}: {
  mode: "create" | "edit";
  category?: AdminCategory;
  categories: AdminCategory[];
}) {
  const router = useRouter();
  const [image, setImage] = useState<CategoryImage | null>(category?.image ?? null);
  const [slugEdited, setSlugEdited] = useState(mode === "edit");
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValuesFor(category),
    mode: "onBlur",
  });

  const nameField = register("name");
  const description = useWatch({ control, name: "description" });
  const seoTitle = useWatch({ control, name: "seoTitle" });
  const seoDescription = useWatch({ control, name: "seoDescription" });

  // A category may not be its own parent, nor sit under one of its descendants.
  const excluded = category
    ? descendantIdsOf(category.id, categories)
    : new Set<string>();

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    try {
      if (mode === "create") {
        const created = await categoriesService.create(buildPayload(values, image));

        toast.success(`“${created.name}” created`);
        router.push(`/admin/categories/${created.id}`);
      } else if (category) {
        const updated = await categoriesService.update(
          category.id,
          buildPayload(values, image),
        );

        toast.success(`“${updated.name}” updated`);
        router.push(`/admin/categories/${category.id}`);
      }
    } catch (error) {
      const message = getApiErrorMessage(error);

      setServerError(message);

      if (/slug/i.test(message)) {
        setError("slug", { message });
      } else if (/already exists/i.test(message)) {
        setError("name", { message });
      }
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <Card>
          <CardHeader
            title="Basic information"
            description="How the category appears in the console and on the storefront."
          />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Category name" htmlFor="name" error={errors.name?.message}>
              <Input
                id="name"
                placeholder="Men’s Clothing"
                invalid={Boolean(errors.name)}
                {...nameField}
                onChange={(event) => {
                  nameField.onChange(event);

                  if (!slugEdited) {
                    setValue("slug", slugify(event.target.value));
                  }
                }}
              />
            </Field>

            <Field
              label="Slug"
              htmlFor="slug"
              error={errors.slug?.message}
              hint="Auto-generated from the name. Changing it changes the storefront URL."
            >
              <div className="flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-900/10">
                <span className="pl-3 text-xs text-slate-400">/categories/</span>
                <input
                  id="slug"
                  placeholder="mens-clothing"
                  className="w-full rounded-lg bg-transparent px-2 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  aria-invalid={Boolean(errors.slug) || undefined}
                  {...register("slug", { onChange: () => setSlugEdited(true) })}
                />
              </div>
            </Field>

            <Field
              label="Parent category"
              htmlFor="parentId"
              hint="Leave empty for a top-level category. Nesting is limited to three levels."
            >
              <Controller
                control={control}
                name="parentId"
                render={({ field }) => (
                  <CategoryTreeSelect
                    id="parentId"
                    categories={categories}
                    value={field.value}
                    onChange={field.onChange}
                    excludedIds={excluded}
                  />
                )}
              />
            </Field>

            <Field
              label="Display order"
              htmlFor="displayOrder"
              error={errors.displayOrder?.message}
              hint="Lower numbers appear first within the same level."
            >
              <Input
                id="displayOrder"
                type="number"
                min="0"
                max="9999"
                step="1"
                invalid={Boolean(errors.displayOrder)}
                {...register("displayOrder")}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field
                label="Description"
                htmlFor="description"
                error={errors.description?.message}
                hint={`${description?.length ?? 0}/500 — shown on the storefront category page.`}
              >
                <Textarea
                  id="description"
                  rows={4}
                  placeholder="Smartphones, feature phones and accessories for every budget."
                  {...register("description")}
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="SEO"
            description="Search-engine overrides. Leave empty to reuse the name and description."
          />
          <CardBody className="grid gap-4">
            <Field
              label="SEO title"
              htmlFor="seoTitle"
              error={errors.seoTitle?.message}
              hint={`${seoTitle?.length ?? 0}/70 characters`}
            >
              <Input
                id="seoTitle"
                placeholder="Men’s Clothing — Shop Online"
                {...register("seoTitle")}
              />
            </Field>

            <Field
              label="SEO description"
              htmlFor="seoDescription"
              error={errors.seoDescription?.message}
              hint={`${seoDescription?.length ?? 0}/160 characters`}
            >
              <Textarea
                id="seoDescription"
                rows={3}
                placeholder="Browse shirts, trousers and jackets for men."
                {...register("seoDescription")}
              />
            </Field>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Category image" description="Shown on the storefront grid." />
          <CardBody>
            <CategoryImageField
              value={image}
              onChange={setImage}
              disabled={isSubmitting}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Visibility"
            description="Only active categories are visible and assignable to published products."
          />
          <CardBody>
            <Field label="Status" htmlFor="status">
              <Select id="status" {...register("status")}>
                <option value="active">Active — visible to customers</option>
                <option value="inactive">Inactive — hidden from customers</option>
              </Select>
            </Field>
          </CardBody>
        </Card>

        {serverError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{serverError}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button type="submit" loading={isSubmitting} className="w-full">
            {mode === "create" ? "Create category" : "Save changes"}
          </Button>
          <Link href="/admin/categories">
            <Button variant="secondary" className="w-full">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to categories
            </Button>
          </Link>
        </div>
      </div>
    </form>
  );
}
