// src/app/(store)/products/[slug]/loading.tsx

import { ProductPageSkeleton } from "@/components/store/skeletons";

/** Keeps the product layout stable between the click and the API's answer. */
export default function Loading() {
  return <ProductPageSkeleton />;
}
