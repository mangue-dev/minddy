"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { cn } from "mangue-ui/lib/utils";
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
 * Public sitemap maps (MIN-73). Same grid and same hierarchy as
 * the cards on the billing page, but without a session: the only action possible here
 * is to create an account — the choice of plan and payment are made in the app,
 * once connected.
 *
 * Prices, limits and features all come from `BILLING_PLANS` and de
 * `planFeatureLabels()`: the prices page cannot be derived from the reality
 * billed.
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

/**
 * `headingLevel`: Blueprint cards are subsections of what comes before them, and what comes before them changes pages. On the landing they follow
 * the `<h2>` “Simple rates” — therefore `h3`. On `/pricing` they follow
 * directly the `<h1>` of the page: a `h3` skipped the `h2` level, which
 * the `heading-order` audit rightly notes (MIN-88).
 */
export function PricingPlans({ headingLevel = 3 }: { headingLevel?: 2 | 3 } = {}) {
  const PlanHeading = (headingLevel === 2 ? "h2" : "h3") as "h2" | "h3";
  const { track } = useAnalytics();
  // Intermediate step of the funnel: many visitors pass through the
  // prices before registering, and this is where those who are lost in the price
  // repels. Without this event, this dropout would be invisible.
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
                <PlanHeading className="text-xl font-semibold tracking-tight">
                  {t(PLAN_LABEL_KEYS[plan.id])}
                </PlanHeading>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
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
                  {/* Same wording on the three cards: paid or not, the only
 action possible from the public site is to create a
 free account — the plan is then chosen in the app. */}
                  {tl("pricingCta")}
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
