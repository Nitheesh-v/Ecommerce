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
import { Switch } from "@/components/admin/ui/switch";
import { getApiErrorMessage } from "@/lib/api/errors";
import { slugify } from "@/lib/utils";
import { productsService } from "@/services/admin/products.service";
import { toast } from "@/store/toast.store";
import type { AdminProduct, Category, ProductImage, ProductWritePayload } from "@/types/product";
import { ImageUploader } from "./image-uploader";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/;
const WHOLE_NUMBER = /^\d+$/;

/** Amounts are edited as rupees; the API always receives integer paise. */
const amount = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((value) => Number.isFinite(Number(value)), `${label} must be a number`)
    .refine((value) => Number(value) > 0, `${label} must be greater than zero`)
    // Decimal places are checked on the string: `Number("2499.99") * 100` is
    // 249998.99999999997, so an arithmetic check would reject valid input.
    .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), `${label} can have at most two decimals`);

const optionalAmount = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => value === undefined || value === "" || Number(value) >= 0,
      `${label} cannot be negative`,
    )
    .refine(
      (value) => value === undefined || value === "" || Number.isFinite(Number(value)),
      `${label} must be a number`,
    );

const productSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(140, "Name must be 140 characters or fewer"),
    slug: z
      .string()
      .trim()
      .max(120, "Slug must be 120 characters or fewer")
      .refine(
        (value) => value === "" || SLUG_PATTERN.test(value),
        "Use lowercase letters, numbers and single hyphens (e.g. wireless-headphones)",
      ),
    sku: z
      .string()
      .trim()
      .min(3, "SKU must be at least 3 characters")
      .max(40, "SKU must be 40 characters or fewer")
      .refine(
        (value) => SKU_PATTERN.test(value),
        "Use letters, numbers, hyphens or underscores — starting with a letter or number",
      ),
    categoryId: z.string().min(1, "Choose a category"),
    brand: z.string().trim().max(80, "Brand must be 80 characters or fewer").optional(),
    shortDescription: z
      .string()
      .trim()
      .max(300, "Short description must be 300 characters or fewer")
      .optional(),
    description: z
      .string()
      .trim()
      .min(10, "Description must be at least 10 characters")
      .max(5000, "Description must be 5000 characters or fewer"),
    price: amount("Regular price"),
    salePrice: optionalAmount("Sale price"),
    costPrice: optionalAmount("Cost price"),
    stock: z
      .string()
      .trim()
      .refine((value) => WHOLE_NUMBER.test(value), "Stock must be a whole number (0 or more)"),
    lowStockThreshold: z
      .string()
      .trim()
      .refine(
        (value) => WHOLE_NUMBER.test(value),
        "Low stock threshold must be a whole number (0 or more)",
      ),
    status: z.enum(["draft", "published", "archived"]),
    isFeatured: z.boolean(),
    seoTitle: z.string().trim().max(70, "SEO title must be 70 characters or fewer").optional(),
    seoDescription: z
      .string()
      .trim()
      .max(160, "SEO description must be 160 characters or fewer")
      .optional(),
  })
  .superRefine((values, ctx) => {
    const price = Number(values.price);
    const salePrice =
      values.salePrice && values.salePrice !== "" ? Number(values.salePrice) : null;

    if (salePrice !== null && salePrice >= price) {
      ctx.addIssue({
        code: "custom",
        path: ["salePrice"],
        message: "Sale price must be lower than the regular price",
      });
    }

    const costPrice =
      values.costPrice && values.costPrice !== "" ? Number(values.costPrice) : null;

    if (costPrice !== null && costPrice === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["costPrice"],
        message: "Cost price must be greater than zero (or left empty)",
      });
    }
  });

type FormValues = z.infer<typeof productSchema>;

const toMinorUnits = (value: string) => Math.round(Number(value) * 100);
const optionalMinorUnits = (value?: string) =>
  value && value.trim() !== "" ? toMinorUnits(value) : null;
const toRupees = (minorUnits?: number | null) =>
  minorUnits === null || minorUnits === undefined ? "" : String(minorUnits / 100);

function defaultValuesFor(product?: AdminProduct): FormValues {
  if (!product) {
    return {
      name: "",
      slug: "",
      sku: "",
      categoryId: "",
      brand: "",
      shortDescription: "",
      description: "",
      price: "",
      salePrice: "",
      costPrice: "",
      stock: "0",
      lowStockThreshold: "5",
      status: "draft",
      isFeatured: false,
      seoTitle: "",
      seoDescription: "",
    };
  }

  return {
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    categoryId: product.categoryId,
    brand: product.brand ?? "",
    shortDescription: product.shortDescription ?? "",
    description: product.description,
    price: toRupees(product.price),
    salePrice: toRupees(product.salePrice),
    costPrice: toRupees(product.costPrice),
    stock: String(product.stock),
    lowStockThreshold: String(product.lowStockThreshold),
    status: product.status,
    isFeatured: product.isFeatured,
    seoTitle: product.seoTitle ?? "",
    seoDescription: product.seoDescription ?? "",
  };
}

function buildPayload(values: FormValues, images: ProductImage[]): ProductWritePayload {
  return {
    name: values.name.trim(),
    slug: values.slug.trim() === "" ? undefined : values.slug.trim(),
    shortDescription: values.shortDescription?.trim() || undefined,
    description: values.description.trim(),
    sku: values.sku.trim().toUpperCase(),
    categoryId: values.categoryId,
    brand: values.brand?.trim() || undefined,
    price: toMinorUnits(values.price),
    salePrice: optionalMinorUnits(values.salePrice),
    costPrice: optionalMinorUnits(values.costPrice),
    stock: Number(values.stock),
    lowStockThreshold: Number(values.lowStockThreshold),
    status: values.status,
    isFeatured: values.isFeatured,
    images: images.map((image) => ({
      url: image.url,
      publicId: image.publicId,
      alt: image.alt,
      isPrimary: image.isPrimary,
    })),
    seoTitle: values.seoTitle?.trim() || undefined,
    seoDescription: values.seoDescription?.trim() || undefined,
  };
}

export function ProductForm({
  mode,
  product,
  categories,
}: {
  mode: "create" | "edit";
  product?: AdminProduct;
  categories: Category[];
}) {
  const router = useRouter();
  const [images, setImages] = useState<ProductImage[]>(product?.images ?? []);
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
    resolver: zodResolver(productSchema),
    defaultValues: defaultValuesFor(product),
    mode: "onBlur",
  });

  const nameField = register("name");
  const activeCategories = categories.filter(
    (category) => category.status === "active" || category.id === product?.categoryId,
  );
  // `useWatch` (not `watch`) keeps the component compatible with React Compiler.
  const status = useWatch({ control, name: "status" });
  const shortDescription = useWatch({ control, name: "shortDescription" });
  const seoTitle = useWatch({ control, name: "seoTitle" });
  const seoDescription = useWatch({ control, name: "seoDescription" });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    if (values.status === "published" && images.length === 0) {
      toast.info("Published products look best with at least one image.");
    }

    try {
      if (mode === "create") {
        const created = await productsService.create(buildPayload(values, images));
        toast.success(`“${created.name}” created`);
        router.push(`/admin/products/${created.id}`);
      } else if (product) {
        const updated = await productsService.update(
          product.id,
          buildPayload(values, images),
        );
        toast.success(`“${updated.name}” updated`);
        router.push(`/admin/products/${product.id}`);
      }
    } catch (error) {
      const message = getApiErrorMessage(error);

      setServerError(message);

      // Surface uniqueness conflicts on the field that caused them.
      if (/slug/i.test(message)) {
        setError("slug", { message });
      } else if (/sku/i.test(message)) {
        setError("sku", { message });
      }
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <Card>
          <CardHeader
            title="Basic information"
            description="What the product is called and where shoppers find it."
          />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name" htmlFor="name" error={errors.name?.message}>
              <Input
                id="name"
                placeholder="Wireless Noise-Cancelling Headphones"
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
              hint="Auto-generated from the name. Edit it only if you need a specific URL."
            >
              <div className="flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-900/10">
                <span className="pl-3 text-xs text-slate-400">/products/</span>
                <input
                  id="slug"
                  placeholder="wireless-headphones"
                  className="w-full rounded-lg bg-transparent px-2 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  aria-invalid={Boolean(errors.slug) || undefined}
                  {...register("slug", {
                    onChange: () => setSlugEdited(true),
                  })}
                />
              </div>
            </Field>

            <Field
              label="SKU"
              htmlFor="sku"
              error={errors.sku?.message}
              hint="Unique stock keeping code. Stored in uppercase."
            >
              <Input
                id="sku"
                placeholder="AUD-1001"
                className="font-mono uppercase"
                invalid={Boolean(errors.sku)}
                {...register("sku")}
              />
            </Field>

            <Field label="Brand (optional)" htmlFor="brand" error={errors.brand?.message}>
              <Input id="brand" placeholder="Sony" {...register("brand")} />
            </Field>

            <Field
              label="Category"
              htmlFor="categoryId"
              error={errors.categoryId?.message}
              hint={
                activeCategories.length === 0
                  ? "No active categories yet — run `npm run seed:categories` in the backend."
                  : "Only active categories can be assigned to a published product."
              }
            >
              <Select
                id="categoryId"
                invalid={Boolean(errors.categoryId)}
                {...register("categoryId")}
              >
                <option value="">Select a category…</option>
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.status === "inactive" ? " (inactive)" : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="sm:col-span-2">
              <Field
                label="Short description"
                htmlFor="shortDescription"
                error={errors.shortDescription?.message}
                hint={`${shortDescription?.length ?? 0}/300 — one line shown on listing cards.`}
              >
                <Textarea
                  id="shortDescription"
                  rows={2}
                  placeholder="40 hours of battery, adaptive noise cancelling, feather-light fit."
                  {...register("shortDescription")}
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field
                label="Full description"
                htmlFor="description"
                error={errors.description?.message}
                hint="Supports plain text. Keep it customer-facing — no internal notes."
              >
                <Textarea
                  id="description"
                  rows={8}
                  placeholder="Describe materials, dimensions, what is in the box…"
                  invalid={Boolean(errors.description)}
                  {...register("description")}
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Pricing"
            description="All amounts in ₹ (INR). Leave the sale price empty when there is no discount."
          />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <Field label="Regular price" htmlFor="price" error={errors.price?.message}>
              <div className="relative">
                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-400">
                  ₹
                </span>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="2499.00"
                  className="pl-7"
                  invalid={Boolean(errors.price)}
                  {...register("price")}
                />
              </div>
            </Field>

            <Field
              label="Sale price (optional)"
              htmlFor="salePrice"
              error={errors.salePrice?.message}
              hint="Must be lower than the regular price."
            >
              <div className="relative">
                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-400">
                  ₹
                </span>
                <Input
                  id="salePrice"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="1999.00"
                  className="pl-7"
                  invalid={Boolean(errors.salePrice)}
                  {...register("salePrice")}
                />
              </div>
            </Field>

            <Field
              label="Cost price (admin only)"
              htmlFor="costPrice"
              error={errors.costPrice?.message}
              hint="Never sent to the storefront — used for margin reporting."
            >
              <div className="relative">
                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-400">
                  ₹
                </span>
                <Input
                  id="costPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="1500.00"
                  className="pl-7"
                  {...register("costPrice")}
                />
              </div>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Inventory"
            description="Stock is decremented by orders; keep the threshold at the point where you want a warning."
          />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Stock quantity" htmlFor="stock" error={errors.stock?.message}>
              <Input
                id="stock"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                invalid={Boolean(errors.stock)}
                {...register("stock")}
              />
            </Field>

            <Field
              label="Low stock threshold"
              htmlFor="lowStockThreshold"
              error={errors.lowStockThreshold?.message}
              hint="Low stock shows when 0 < stock ≤ threshold."
            >
              <Input
                id="lowStockThreshold"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                {...register("lowStockThreshold")}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="SEO"
            description="Overrides for search engines. Leave empty to reuse the product name and description."
          />
          <CardBody className="grid gap-4">
            <Field
              label="SEO title"
              htmlFor="seoTitle"
              error={errors.seoTitle?.message}
              hint={`${seoTitle?.length ?? 0}/70 characters`}
            >
              <Input id="seoTitle" placeholder="Wireless Headphones — 40h Battery" {...register("seoTitle")} />
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
                placeholder="Shop wireless headphones with adaptive noise cancelling and 40 hours of battery life."
                {...register("seoDescription")}
              />
            </Field>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Images"
            description="Up to 8 images. The first one is the thumbnail."
          />
          <CardBody>
            <ImageUploader images={images} onChange={setImages} disabled={isSubmitting} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Visibility" description="Control who can see this product." />
          <CardBody className="space-y-4">
            <Field label="Status" htmlFor="status">
              <Select id="status" {...register("status")}>
                <option value="draft">Draft — hidden from customers</option>
                <option value="published">Published — visible and purchasable</option>
                <option value="archived">Archived — hidden, kept for history</option>
              </Select>
            </Field>

            <Controller
              control={control}
              name="isFeatured"
              render={({ field }) => (
                <Switch
                  id="isFeatured"
                  checked={field.value}
                  onChange={field.onChange}
                  label="Featured product"
                  description="Highlight on the storefront home page."
                />
              )}
            />

            {status === "archived" ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Archived products stay in the database for order history but are never
                shown or sold on the storefront.
              </p>
            ) : null}
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
            {mode === "create" ? "Create product" : "Save changes"}
          </Button>
          <Link href="/admin/products">
            <Button variant="secondary" className="w-full">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to products
            </Button>
          </Link>
        </div>
      </div>
    </form>
  );
}
