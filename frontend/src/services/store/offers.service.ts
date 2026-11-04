import { cacheLife, cacheTag } from "next/cache";
import { fetchPublic } from "@/lib/api/public";
import type { PublicOffer } from "@/types/offer";

/**
 * Storefront offers.
 *
 * Only `GET /offers/active` is used: the API decides what is live (window, usage
 * counters, `customerVisible`) and returns a public projection with no internal
 * campaign settings. The read is cached like the rest of the catalogue so the page
 * stays prerenderable while the API remains the source of truth.
 */
async function readActiveOffers(): Promise<PublicOffer[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("offers");

  // A restarting API degrades to "no offers" rather than a 500 storefront.
  return fetchPublic<PublicOffer[]>("/offers/active", undefined, { fallback: [] });
}

export const offersStorefront = {
  active: readActiveOffers,
};
