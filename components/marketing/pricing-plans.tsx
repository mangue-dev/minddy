"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button, cn } from "mangue-ui";
import {
  BILLING_PLANS,
  annualMonthlyEquivalentEur,
  annualPriceEur,
  type BillingInterval,
  type BillingPlanId,
} from "@/lib/billing-plans";
import { planFeatureLabels } from "@/lib/plan-features";
import { useAnalytics } from "@/lib/use-analytics";
import { useTrackView } from "@/lib/use-track-view";

/**
 * Cartes de plans du site public (MIN-73). Même grille et même hiérarchie que
 * les cartes de la page billing, mais sans session : le seul geste possible ici
 * est de créer un compte — le choix du plan et le paiement se font dans l'app,
 * une fois connecté.
 *
 * Prix, limites et features viennent tous de `BILLING_PLANS` et de
 * `planFeatureLabels()` : la page tarifs ne peut pas dériver de la réalité
 * facturée.
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

export function PricingPlans() {
  const { track } = useAnalytics();
  // Marche intermédiaire de l'entonnoir : beaucoup de visiteurs passent par les
  // tarifs avant de s'inscrire, et c'est là que se perdent ceux que le prix
  // rebute. Sans cet événement, ce décrochage-là serait invisible.
  useTrackView(true, "pricing", () => track("pricing_viewed", { surface: "marketing" }));
  const t = useTranslations("Billing");
  const tl = useTranslations("Landing");
  const locale = useLocale();
  const [interval, setInterval] = useState<BillingInterval>("month");

  const formatEur = useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value),
    [locale],
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setInterval("month")}
            className={cn(
              "rounded-md px-3 py-1.5 transition-colors",
              interval === "month"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
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
                : "text-muted-foreground hover:text-foreground",
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
          const isFree = plan.id === "free";
          const showYearly = interval === "year" && !isFree;
          const displayPriceEur = showYearly
            ? annualMonthlyEquivalentEur(plan)
            : plan.priceEurMonthly;
          const highlighted = !!plan.highlighted;

          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-xl border p-6",
                highlighted
                  ? "border-primary/50 bg-gradient-to-b from-primary/8 to-primary/3 shadow-[0_0_0_1px_--alpha(var(--color-primary)/15%),0_4px_24px_-4px_--alpha(var(--color-primary)/15%)]"
                  : "border-border bg-card",
              )}
            >
              {highlighted && (
                <span className="absolute -top-2.5 left-5 flex h-5 items-center rounded-full border border-primary bg-card px-2 text-xs font-semibold text-primary">
                  {tl("pricingPopular")}
                </span>
              )}

              <div className="mb-5">
                <h3 className="text-sm font-bold tracking-tight">{t(PLAN_LABEL_KEYS[plan.id])}</h3>
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
                    {isFree ? t("forever") : t("perMonth")}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {showYearly ? t("billedYearly", { total: formatEur(annualPriceEur(plan)) }) : " "}
                </p>
              </div>

              <ul className="mb-6 flex-1 space-y-2.5">
                {planFeatureLabels(plan, t).map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                        highlighted ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Check className="size-2.5" strokeWidth={3} />
                    </span>
                    <span className="text-xs leading-relaxed text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button asChild variant={highlighted ? "default" : "outline"} className="w-full">
                <Link
                  href="/signup"
                  onClick={() =>
                    track("plan_cta_clicked", {
                      plan_id: plan.id,
                      interval,
                      current_plan_id: "anonymous",
                    })
                  }
                >
                  {isFree ? tl("pricingCtaFree") : tl("pricingCtaPaid")}
                </Link>
              </Button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">{tl("pricingNote")}</p>
    </div>
  );
}
