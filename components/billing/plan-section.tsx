"use client";

import { useCallback, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button, cn, toast } from "mangue-ui";
import {
  BILLING_PLANS,
  billingPlanRank,
  annualPriceEur,
  annualMonthlyEquivalentEur,
  type BillingInterval,
  type BillingPlanId,
} from "@/lib/billing-plans";
import { planFeatureLabels } from "@/lib/plan-features";
import { useBillingSummary } from "@/lib/use-billing-query";
import { createCheckoutApi, createPortalApi } from "@/lib/billing-api";

/**
 * Les cartes de plans de la page billing (MIN-72, retours) — design calqué sur
 * AutoKap : carte mise en avant teintée + ring, badge « Plan actuel » flottant,
 * prix / description / features en check-list, CTA pleine largeur. L'usage se
 * dit en MULTIPLES de Free (« 10× plus d'usage »), jamais en montants.
 *
 * Bascule mensuel / annuel (2 mois offerts) : n'affecte que le CHECKOUT (nouvel
 * abonnement). Un abonné actif change de formule/cadence via le Customer Portal.
 */

const PLAN_LABEL_KEYS: Record<BillingPlanId, "planFree" | "planGo" | "planPro"> = {
  free: "planFree",
  go: "planGo",
  pro: "planPro",
};

const PLAN_DESC_KEYS: Record<BillingPlanId, "planDescFree" | "planDescGo" | "planDescPro"> = {
  free: "planDescFree",
  go: "planDescGo",
  pro: "planDescPro",
};

export function PlanSection() {
  const t = useTranslations("Billing");
  const locale = useLocale();
  const { loading, status, planId } = useBillingSummary();
  const [submittingPlanId, setSubmittingPlanId] = useState<string | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("month");

  const hasSubscription = !!status?.subscription;
  const stripeConfigured = status?.stripeConfigured ?? false;
  const userRank = billingPlanRank(planId);

  const formatEur = useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value),
    [locale]
  );

  const openPortal = useCallback(async (asPlanId: string) => {
    setSubmittingPlanId(asPlanId);
    try {
      window.location.href = await createPortalApi();
    } catch (error) {
      toast.error((error as Error).message);
      setSubmittingPlanId(null);
    }
  }, []);

  const startCheckout = useCallback(
    async (target: BillingPlanId, chosenInterval: BillingInterval) => {
      setSubmittingPlanId(target);
      try {
        window.location.href = await createCheckoutApi(target, chosenInterval);
      } catch (error) {
        toast.error((error as Error).message);
        setSubmittingPlanId(null);
      }
    },
    []
  );

  return (
    <div className="space-y-5">
      {/* Bascule mensuel / annuel — l'annuel offre 2 mois. */}
      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setInterval("month")}
            className={cn(
              "rounded-md px-3 py-1.5 transition-colors",
              interval === "month"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("billingMonthly")}
          </button>
          <button
            type="button"
            onClick={() => setInterval("year")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
              interval === "year"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("billingYearly")}
            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              {t("yearlySavings")}
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {BILLING_PLANS.map((plan) => {
          const isCurrent = plan.id === planId;
          const isFreeCard = plan.id === "free";
          const isHighlighted =
            !!plan.highlighted && userRank <= billingPlanRank(plan.id);
          const showYearly = interval === "year" && !isFreeCard;
          const displayPriceEur = showYearly
            ? annualMonthlyEquivalentEur(plan)
            : plan.priceEurMonthly;

          let ctaLabel: string;
          let onAction: (() => void) | undefined;
          if (isCurrent) {
            ctaLabel = isFreeCard ? t("currentPlanBadge") : t("manageSubscription");
            if (!isFreeCard && hasSubscription) onAction = () => void openPortal(plan.id);
          } else if (isFreeCard) {
            // Revenir à Free = annuler l'abonnement — flux géré dans le portal.
            ctaLabel = t("cancelSubscription");
            if (hasSubscription) onAction = () => void openPortal(plan.id);
          } else {
            ctaLabel = t("switchToPlan", { plan: t(PLAN_LABEL_KEYS[plan.id]) });
            if (hasSubscription) onAction = () => void openPortal(plan.id);
            else if (stripeConfigured)
              onAction = () => void startCheckout(plan.id, interval);
          }

          const disabled = loading || submittingPlanId !== null || !onAction;

          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-xl border p-5 transition-all duration-200",
                isHighlighted
                  ? "border-primary/50 bg-gradient-to-b from-primary/8 to-primary/3 shadow-[0_0_0_1px_--alpha(var(--color-primary)/15%),0_4px_24px_-4px_--alpha(var(--color-primary)/15%)]"
                  : isCurrent && !isFreeCard
                    ? "border-primary/40 bg-card shadow-sm ring-1 ring-primary/20"
                    : "border-border bg-card hover:border-foreground/20 hover:shadow-sm"
              )}
            >
              {isCurrent && (
                <span className="absolute -top-2.5 left-4 flex h-5 items-center rounded-full border border-primary bg-card px-2 text-xs font-semibold text-primary">
                  {t("currentPlanBadge")}
                </span>
              )}

              <div className="mb-5">
                <h3 className="text-sm font-bold tracking-tight text-foreground">
                  {t(PLAN_LABEL_KEYS[plan.id])}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t(PLAN_DESC_KEYS[plan.id])}
                </p>
              </div>

              <div className="mb-5 border-b border-border/60 pb-5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold tracking-tight">
                    {formatEur(displayPriceEur)} €
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isFreeCard ? t("forever") : t("perMonth")}
                  </span>
                </div>
                {showYearly && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {t("billedYearly", { total: formatEur(annualPriceEur(plan)) })}
                  </p>
                )}
              </div>

              <ul className="mb-5 flex-1 space-y-2.5">
                {planFeatureLabels(plan, t).map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                        isHighlighted
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Check className="size-2.5" strokeWidth={3} />
                    </span>
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                size="sm"
                disabled={disabled}
                onClick={onAction}
                variant={isCurrent || isFreeCard ? "outline" : isHighlighted ? "default" : "outline"}
                className={cn(
                  "w-full",
                  isCurrent && !onAction && "cursor-default text-muted-foreground",
                  !isHighlighted && !isCurrent && "border-foreground/20 hover:bg-accent/50"
                )}
              >
                {submittingPlanId === plan.id ? t("loading") : ctaLabel}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
