"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, History, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState, ErrorState, Skeleton } from "@/components/admin/ui/states";
import { getApiErrorStatus, getApiErrorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils";
import { offersService } from "@/services/admin/coupons.service";
import type { OfferDetail } from "@/types/offer";
import { OfferForm } from "./offer-form";
import { OfferStatusBadge } from "./offer-status-badge";

interface LoadState {
  offer: OfferDetail | null;
  error: string | null;
  missing: boolean;
}

/**
 * Create/edit shell.
 *
 * `offerId` switches the screen to edit mode: the offer is fetched once on mount,
 * the form is keyed by its id (so switching offers rebuilds the state), and the
 * audit history is shown beside the editor.
 */
export function OfferFormView({ offerId }: { offerId?: string }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({
    offer: null,
    error: null,
    missing: false,
  });
  const [loading, setLoading] = useState(Boolean(offerId));

  useEffect(() => {
    if (!offerId) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    offersService
      .get(offerId, controller.signal)
      .then((offer) => {
        if (active) {
          setState({ offer, error: null, missing: false });
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        const missing = getApiErrorStatus(error) === 404;

        setState({
          offer: null,
          error: missing ? null : getApiErrorMessage(error),
          missing,
        });
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [offerId]);

  const header = (
    <PageHeader
      title={offerId ? state.offer?.name ?? "Edit offer" : "New offer"}
      description={
        offerId
          ? "Change the code, limits or eligibility. Existing orders keep the discount they were placed with."
          : "Create a coupon, then share the code or let customers find it on /offers."
      }
      actions={
        <>
          <Link href="/admin/offers">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to offers
            </Button>
          </Link>
          {offerId ? (
            <Link href={`/admin/offers/${offerId}/redemptions`}>
              <Button variant="secondary">Redemptions</Button>
            </Link>
          ) : null}
        </>
      }
    />
  );

  if (loading) {
    return (
      <div className="space-y-5">
        {header}
        <Card>
          <CardBody className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </CardBody>
        </Card>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="space-y-5">
        {header}
        <ErrorState message={state.error} onRetry={() => router.refresh()} />
      </div>
    );
  }

  if (state.missing) {
    return (
      <div className="space-y-5">
        {header}
        <EmptyState
          icon={Ticket}
          title="Offer not found"
          description="It may have been removed. Head back to the list to pick another."
          action={
            <Link href="/admin/offers" className="mt-2">
              <Button size="sm">Back to offers</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}

      {state.offer ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold tracking-wide">
            {state.offer.code}
          </code>
          <OfferStatusBadge
            status={state.offer.status}
            label={state.offer.statusLabel}
          />
          <span>
            {state.offer.usageCount} used
            {state.offer.totalUsageLimit === null
              ? " (unlimited)"
              : ` of ${state.offer.totalUsageLimit}`}
          </span>
          <span className="text-slate-400">·</span>
          <span>{state.offer.redeemedCount} redeemed</span>
          <span className="text-slate-400">·</span>
          <span>
            {state.offer.redemptionCount} confirmed
            {state.offer.discountGiven > 0 ? " · " : ""}
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <OfferForm
          key={state.offer?.id ?? "new"}
          offer={state.offer}
          onSaved={(saved) => {
            router.push("/admin/offers");
            router.refresh();
            void saved;
          }}
        />

        {state.offer ? (
          <Card className="h-fit">
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <History className="h-4 w-4 text-slate-400" aria-hidden />
                  Audit trail
                </span>
              }
              description="Every change is recorded against the admin who made it."
            />
            <CardBody>
              <ol className="space-y-3">
                {state.offer.history.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="text-sm">
                    <p className="font-medium text-slate-800">{entry.action}</p>
                    {entry.note ? (
                      <p className="text-xs text-slate-500">{entry.note}</p>
                    ) : null}
                    <p className="text-xs text-slate-400">
                      {entry.by ?? "system"} · {formatDateTime(entry.at)}
                    </p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
