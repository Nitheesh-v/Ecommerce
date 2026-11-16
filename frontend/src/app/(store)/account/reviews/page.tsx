// src/app/(store)/account/reviews/page.tsx

import type { Metadata } from "next";
import { MyReviews } from "@/components/store/account/my-reviews";
import { RequireCustomer } from "@/components/store/account/require-customer";

export const metadata: Metadata = {
  title: "My reviews",
  description: "Reviews you have written for products you received.",
  robots: { index: false, follow: false },
};

/** Signed-in only; the feed is per-account and includes unapproved reviews. */
export default function MyReviewsPage() {
  return (
    <RequireCustomer>
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="font-display text-2xl text-bark-950">My reviews</h1>
          <p className="mt-1 text-sm text-bark-600">
            Everything you have rated, with its moderation status — a review waits for
            approval before it appears on the product page.
          </p>
        </div>
        <MyReviews />
      </div>
    </RequireCustomer>
  );
}
