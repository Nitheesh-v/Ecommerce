/** Public product projection — never contains `costPrice`. */
export interface PublicProduct {
  id: string;
  name: string;
  slug: string;
  shortDescription?: string;
  description: string;
  sku: string;
  brand?: string;
  category: { id: string; name: string; slug: string } | null;
  /** Minor units (paise). */
  price: number;
  salePrice?: number | null;
  effectivePrice: number;
  stock: number;
  inStock: boolean;
  isFeatured: boolean;
  images: { url: string; alt?: string; isPrimary: boolean }[];
  seoTitle?: string;
  seoDescription?: string;
  createdAt: string;
  updatedAt: string;
}
