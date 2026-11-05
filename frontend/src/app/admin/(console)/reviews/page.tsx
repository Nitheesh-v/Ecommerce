import type { Metadata } from "next";
import { ReviewsView } from "@/components/admin/reviews/reviews-view";

export const metadata: Metadata = {
  title: "Reviews & ratings",
};

/** Opts out of instant-navigation validation — see `admin/(console)` convention. */
export const instant = false;

export default function AdminReviewsPage() {
  return <ReviewsView />;
}
