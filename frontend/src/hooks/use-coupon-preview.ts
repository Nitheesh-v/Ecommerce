"use client";

import { useCallback, useState } from "react";
import { getApiErrorMessage } from "@/lib/api/errors";
import { couponsService } from "@/services/admin/coupons.service";
import type { CouponValidation } from "@/types/offer";

export interface CouponCartLine {
  productId: string;
  quantity: number;
}

interface PreviewState {
  code: string;
  quote: CouponValidation | null;
  error: string | null;
  pending: boolean;
}

const EMPTY: PreviewState = { code: "", quote: null, error: null, pending: false };

/**
 * Applies and removes a coupon code against a cart.
 *
 * Only `{ code, items }` leaves the browser — the discount, shipping and total in
 * `quote` come from the API, which re-prices the cart from its own catalogue. The
 * checkout still re-quotes server-side, so this preview is display only.
 */
export function useCouponPreview(lines: CouponCartLine[]) {
  const [state, setState] = useState<PreviewState>(EMPTY);

  const apply = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();

      if (!code || lines.length === 0) {
        setState({ ...EMPTY, error: code ? null : "Enter a coupon code" });

        return;
      }

      setState((previous) => ({ ...previous, pending: true, error: null }));

      try {
        const quote = await couponsService.validate(code, lines);

        setState({ code: quote.code, quote, error: null, pending: false });
      } catch (error) {
        setState({ code: "", quote: null, error: getApiErrorMessage(error), pending: false });
      }
    },
    [lines],
  );

  const remove = useCallback(() => setState(EMPTY), []);

  return {
    ...state,
    apply,
    remove,
    applied: state.quote !== null,
  };
}
