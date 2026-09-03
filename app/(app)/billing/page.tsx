"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, toast } from "mangue-ui";
import { AppContentHeader } from "@/components/app-content-header";
import { UsageSection } from "@/components/billing/usage-section";
import { PlanSection } from "@/components/billing/plan-section";
import { UsageHistorySection } from "@/components/billing/usage-history-section";
import { useBillingSummary } from "@/lib/use-billing-query";
import { createPortalApi } from "@/lib/billing-api";
import { useScrollFade } from "@/lib/use-scroll-fade";
import {
  billingStatusQueryKey,
  billingUsageQueryKey,
} from "@/lib/use-billing-query";

/**
 * Dedicated billing page (MIN-72, returns — like AutoKap /billing):
 * use of the current window, plan maps, typed history. CTAs for
 * Stripe checkout/portal return here (`?billing=success|cancelled`).
 */
export default function BillingPage() {
  const t = useTranslations("Billing");
  const { loading, status, usage } = useBillingSummary();
  const hasManagedService = status?.managedBilling || usage?.managedAi;
  const hasSubscription = !!status?.subscription;
  const [openingPortal, setOpeningPortal] = useState(false);
  const contentFade = useScrollFade<HTMLDivElement>();

  const openPortal = useCallback(async () => {
    setOpeningPortal(true);
    try {
      window.location.href = await createPortalApi();
    } catch (error) {
      toast.error((error as Error).message);
      setOpeningPortal(false);
    }
  }, []);

  if (!loading && !hasManagedService) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <AppContentHeader />
        <div
          ref={contentFade.ref}
          {...contentFade.scrollProps}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-5xl px-6 py-10">
            <div className="rounded-xl border border-border bg-card px-5 py-4">
              <h2 className="text-sm font-semibold">{t("selfHostedTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("selfHostedDescription")}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <Suspense fallback={null}>
        <CheckoutReturnToast />
      </Suspense>

      <AppContentHeader contentClassName="justify-end gap-2">
        {hasSubscription ? (
          <Button
            size="sm"
            variant="outline"
            disabled={openingPortal}
            onClick={() => void openPortal()}
          >
            {openingPortal ? t("loading") : t("manageSubscription")}
          </Button>
        ) : null}
      </AppContentHeader>

      <div
        ref={contentFade.ref}
        {...contentFade.scrollProps}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-5xl px-6 py-10">
          <div className="space-y-10">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">{t("usageTitle")}</h2>
              <UsageSection />
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold">{t("plansTitle")}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {status?.adminOverride
                    ? t("adminOverrideSectionSubtitle")
                    : t("plansSubtitle")}
                </p>
              </div>
              <PlanSection />
            </section>

            {/* The accordion has its own header (title + subtitle). */}
            <section>
              <UsageHistorySection />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Checkout return: toast once, refetch, URL cleaning. */
function CheckoutReturnToast() {
  const t = useTranslations("Billing");
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const handled = useRef(false);

  const billingParam = searchParams.get("billing");
  useEffect(() => {
    if (!billingParam || handled.current) return;
    handled.current = true;
    if (billingParam === "success") {
      toast.success(t("checkoutSuccess"));
      void queryClient.invalidateQueries({ queryKey: billingStatusQueryKey });
      void queryClient.invalidateQueries({ queryKey: billingUsageQueryKey });
    } else if (billingParam === "cancelled") {
      toast(t("checkoutCancelled"));
    }
    router.replace("/billing", { scroll: false });
  }, [billingParam, queryClient, router, t]);

  return null;
}
