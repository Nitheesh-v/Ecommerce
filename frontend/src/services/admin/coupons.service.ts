import { apiClient, requestData, requestPage } from "@/lib/api/client";
import type { ApiSuccess } from "@/types/auth";
import type {
  AdminOffer,
  CouponRedemption,
  CouponValidation,
  OfferDetail,
  OfferListQuery,
  OfferSummary,
  OfferWritePayload,
  PublicOffer,
  RedemptionListQuery,
} from "@/types/offer";

function toParams(query: object) {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== undefined && value !== "" && value !== null,
    ),
  );
}

/** Admin offer console (list, cards, CRUD, status, redemptions, CSV). */
export const offersService = {
  list(query: OfferListQuery, signal?: AbortSignal) {
    return requestPage<AdminOffer>(
      apiClient.get<ApiSuccess<AdminOffer[]>>("/admin/offers", {
        signal,
        params: toParams(query),
      }),
    );
  },

  /** Stat cards: totals, lifecycle counts, redemptions and discount given. */
  summary(signal?: AbortSignal) {
    return requestData<OfferSummary>(
      apiClient.get("/admin/offers/summary", { signal }),
    );
  },

  get(id: string, signal?: AbortSignal) {
    return requestData<OfferDetail>(
      apiClient.get(`/admin/offers/${id}`, { signal }),
    );
  },

  create(payload: OfferWritePayload) {
    return requestData<OfferDetail>(apiClient.post("/admin/offers", payload));
  },

  update(id: string, payload: Partial<OfferWritePayload>) {
    return requestData<OfferDetail>(
      apiClient.patch(`/admin/offers/${id}`, payload),
    );
  },

  /** Pause or resume an offer without touching its configuration. */
  changeStatus(id: string, isActive: boolean, reason?: string) {
    return requestData<OfferDetail>(
      apiClient.patch(`/admin/offers/${id}/status`, {
        isActive,
        ...(reason ? { reason } : {}),
      }),
    );
  },

  /** Archives the offer: hidden from customers, history retained. */
  archive(id: string) {
    return requestData<OfferDetail>(apiClient.delete(`/admin/offers/${id}`));
  },

  redemptions(query: RedemptionListQuery, signal?: AbortSignal) {
    return requestPage<CouponRedemption>(
      apiClient.get<ApiSuccess<CouponRedemption[]>>("/admin/redemptions", {
        signal,
        params: toParams(query),
      }),
    );
  },

  redemptionsForOffer(
    id: string,
    query: Omit<RedemptionListQuery, "offerId">,
    signal?: AbortSignal,
  ) {
    return requestPage<CouponRedemption>(
      apiClient.get<ApiSuccess<CouponRedemption[]>>(
        `/admin/offers/${id}/redemptions`,
        { signal, params: toParams(query) },
      ),
    );
  },

  /** Downloads the redemption ledger as CSV and returns the file name. */
  async exportRedemptions(query: Partial<RedemptionListQuery>): Promise<string> {
    const { data } = await apiClient.get<Blob>("/admin/redemptions/export", {
      params: toParams({ ...query }),
      responseType: "blob",
    });
    const url = URL.createObjectURL(data);
    const link = document.createElement("a");

    link.href = url;
    link.download = `coupon-redemptions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    return link.download;
  },
};

/**
 * Customer-facing coupon preview.
 *
 * The browser sends *which products and how many* — never an amount. The API
 * re-prices the cart from its own catalogue and returns the discount, so a patched
 * request cannot invent a cheaper cart.
 */
export const couponsService = {
  validate(code: string, items: Array<{ productId: string; quantity: number }>) {
    return requestData<CouponValidation>(
      apiClient.post("/coupons/validate", { code, items }),
    );
  },
};

/** Public offers page read (unauthenticated). */
export async function fetchActiveOffers(search?: string): Promise<PublicOffer[]> {
  const response = await apiClient.get<ApiSuccess<PublicOffer[]>>("/offers/active", {
    params: toParams({ search }),
  });

  return response.data.data;
}
