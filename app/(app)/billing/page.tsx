"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "mangue-ui";
import { UsageSection } from "@/components/billing/usage-section";
import { PlanSection } from "@/components/billing/plan-section";
import { UsageHistorySection } from "@/components/billing/usage-history-section";
import { useBillingSummary } from "@/lib/use-billing-query";
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

  if (!loading && !hasManagedService) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        </header>
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <h2 className="text-sm font-semibold">{t("selfHostedTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("selfHostedDescription")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <Suspense fallback={null}>
        <CheckoutReturnToast />
      </Suspense>

      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">{t("pageTitle")}</h1>
      </header>

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
