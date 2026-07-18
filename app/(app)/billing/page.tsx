"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "mangue-ui";
import { UsageSection } from "@/components/billing/usage-section";
import { PlanSection } from "@/components/billing/plan-section";
import { UsageHistorySection } from "@/components/billing/usage-history-section";
import {
  billingStatusQueryKey,
  billingUsageQueryKey,
} from "@/lib/use-billing-query";

/**
 * Page facturation dédiée (MIN-72, retours — comme AutoKap /billing) :
 * usage de la fenêtre courante, cartes de plans, historique typé. Les CTA
 * checkout/portal Stripe reviennent ici (`?billing=success|cancelled`).
 */
export default function BillingPage() {
  const t = useTranslations("Billing");

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <Suspense fallback={null}>
        <CheckoutReturnToast />
      </Suspense>

      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("pageSubtitle")}</p>
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
              {t("plansSubtitle")}
            </p>
          </div>
          <PlanSection />
        </section>

        {/* L'accordéon porte son propre en-tête (titre + sous-titre). */}
        <section>
          <UsageHistorySection />
        </section>
      </div>
    </div>
  );
}

/** Retour de Checkout : toast une seule fois, refetch, nettoyage de l'URL. */
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
