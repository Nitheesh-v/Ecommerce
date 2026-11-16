// src/app/(store)/categories/[slug]/loading.tsx

import { CatalogueSkeleton } from "@/components/store/skeletons";

export default function Loading() {
  return <CatalogueSkeleton cards={12} />;
}
