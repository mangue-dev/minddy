"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button, cn, toast } from "mangue-ui";
import {
  BILLING_PLANS,
  billingPlanRank,
  usageMultiplierVsFree,
  type BillingPlan,
  type BillingPlanId,
} from "@/lib/billing-plans";
import { useBillingSummary } from "@/lib/use-billing-query";
import { createCheckoutApi, createPortalApi } from "@/lib/billing-api";

/**
 * Les cartes de plans de la page billing (MIN-72, retours) — design calqué sur
 * AutoKap : carte mise en avant teintée + ring, badge « Plan actuel » flottant,
 * prix / description / features en check-list, CTA pleine largeur. L'usage se
 * dit en MULTIPLES de Free (« 10× plus d'usage »), jamais en montants.
 *
 * Logique des CTA (AutoKap) : pas d'abonnement → Checkout ; abonnement actif →
 * tout passe par le Customer Portal (upgrade, downgrade, annulation via la
 * carte Free).
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

function planFeatures(
  plan: BillingPlan,
  t: ReturnType<typeof useTranslations<"Billing">>
): string[] {
  const usage =
    plan.id === "free"
      ? t("featureBaseUsage")
      : t("featureUsageMultiplier", { n: usageMultiplierVsFree(plan) });
  return [
    usage,
    plan.maxProjects == null
      ? t("featureUnlimitedProjects")
      : t("featureMaxProjects", { n: plan.maxProjects }),
    plan.maxIssuesPerProject == null
      ? t("featureUnlimitedIssues")
      : t("featureMaxIssues", { n: plan.maxIssuesPerProject }),
    ...(plan.allowAgents ? [t("featureAgents")] : []),
    ...(plan.allowMembers ? [t("featureMembers")] : []),
  ];
}

export function PlanSection() {
  const t = useTranslations("Billing");
  const { loading, status, planId } = useBillingSummary();
  const [submittingPlanId, setSubmittingPlanId] = useState<string | null>(null);

  const hasSubscription = !!status?.subscription;
  const stripeConfigured = status?.stripeConfigured ?? false;
  const userRank = billingPlanRank(planId);

  const openPortal = useCallback(async (asPlanId: string) => {
    setSubmittingPlanId(asPlanId);
    try {
      window.location.href = await createPortalApi();
    } catch (error) {
      toast.error((error as Error).message);
      setSubmittingPlanId(null);
    }
  }, []);

  const startCheckout = useCallback(async (target: BillingPlanId) => {
    setSubmittingPlanId(target);
    try {
      window.location.href = await createCheckoutApi(target);
    } catch (error) {
      toast.error((error as Error).message);
      setSubmittingPlanId(null);
    }
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {BILLING_PLANS.map((plan) => {
        const isCurrent = plan.id === planId;
        const isFreeCard = plan.id === "free";
        const isHighlighted =
          !!plan.highlighted && userRank <= billingPlanRank(plan.id);

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
          else if (stripeConfigured) onAction = () => void startCheckout(plan.id);
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
                  {plan.priceEurMonthly} €
                </span>
                <span className="text-xs text-muted-foreground">
                  {isFreeCard ? t("forever") : t("perMonth")}
                </span>
              </div>
            </div>

            <ul className="mb-5 flex-1 space-y-2.5">
              {planFeatures(plan, t).map((feature) => (
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
  );
}
