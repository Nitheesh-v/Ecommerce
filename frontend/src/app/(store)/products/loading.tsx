// src/app/(store)/products/loading.tsx

import { CatalogueSkeleton } from "@/components/store/skeletons";

/** Instant skeleton while the catalogue query resolves on the server. */
export default function Loading() {
  return <CatalogueSkeleton />;
}
