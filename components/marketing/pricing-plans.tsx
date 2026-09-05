"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "mangue-ui/lib/utils";
import {
  BILLING_PLANS, annualMonthlyEquivalentEur, annualPriceEur,
  type BillingInterval, type BillingPlanId,
} from "@/lib/billing-plans";
import { planFeatureLabels } from "@/lib/plan-features";
import { useAnalytics } from "@/lib/use-analytics";
import { useTrackView } from "@/lib/use-track-view";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";
import { CARD_TONES } from "./card-tones";

const PLAN_LABEL_KEYS = { free: "planFree", go: "planGo", pro: "planPro" } as const;
const PLAN_DESC_KEYS = { free: "planDescFree", go: "planDescGo", pro: "planDescPro" } as const;
const PLAN_TONES: Record<BillingPlanId, string> = {
  free: CARD_TONES.sky, go: CARD_TONES.butter, pro: CARD_TONES.lavender,
};

/** Public prices and limits come from the billing model; signup remains the only purchase entry. */
export function PricingPlans({
  headingLevel = 3, compact = false, comparisonLink,
}: { headingLevel?: 2 | 3; compact?: boolean; comparisonLink?: ReactNode } = {}) {
  const PlanHeading = headingLevel === 2 ? "h2" : "h3";
  const { track } = useAnalytics();
  useTrackView(true, "pricing", () => track("pricing_viewed", { surface: "marketing" }));
  const t = useTranslations("Billing");
  const tl = useTranslations("Landing");
  const locale = useLocale();
  const [interval, setInterval] = useState<BillingInterval>("month");
  const formatEur = useCallback((value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value), [locale]);

  return (
    <div>
      <div className="mb-8 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
        <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl bg-[#f3f1ed] p-1.5 text-sm font-medium dark:bg-[#252525]">
          {(["month", "year"] as const).map(value => (
            <button key={value} type="button" aria-pressed={interval === value}
              onClick={() => setInterval(value)}
              className={cn("inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                interval === value ? "bg-white text-foreground dark:bg-[#414141]" : "text-muted-foreground hover:text-foreground")}>
              {t(value === "month" ? "billingMonthly" : "billingYearly")}
              {value === "year" && <span className="text-xs font-normal opacity-70">{t("yearlySavings")}</span>}
            </button>
          ))}
        </div>
        {comparisonLink}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {BILLING_PLANS.map(plan => {
          const isFree = plan.id === "free";
          const showYearly = interval === "year" && !isFree;
          const displayPrice = showYearly ? annualMonthlyEquivalentEur(plan) : plan.priceEurMonthly;
          return (
            <article key={plan.id} className={cn("flex min-w-0 flex-col rounded-2xl p-6 lg:p-8", PLAN_TONES[plan.id])}>
              <div className="mb-5 flex min-h-7 flex-wrap items-center justify-between gap-2">
                <PlanHeading className="text-2xl font-medium tracking-tight">{t(PLAN_LABEL_KEYS[plan.id])}</PlanHeading>
                {plan.highlighted && <span className="rounded-md bg-white/45 px-2.5 py-1 text-xs font-medium dark:bg-white/10">{tl("pricingPopular")}</span>}
              </div>
              <p className="min-h-12 text-sm leading-relaxed opacity-80">{t(PLAN_DESC_KEYS[plan.id])}</p>
              <div className="my-8">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-5xl font-medium tracking-[-0.05em]">{formatEur(displayPrice)} €</span>
                  <span className="text-sm opacity-75">{isFree ? t("forever") : t("perMonth")}</span>
                </div>
                <p className="mt-3 min-h-10 text-xs leading-relaxed opacity-75">
                  {showYearly ? t("billedYearly", { total: formatEur(annualPriceEur(plan)) }) : " "}
                </p>
              </div>
              <ul className="mb-9 flex-1 space-y-3.5">
                {planFeatureLabels(plan, t).map(feature => <li key={feature} className="flex items-start gap-3 text-sm leading-relaxed">
                  <Check className="mt-1 size-4 shrink-0" strokeWidth={1.5} aria-hidden /><span>{feature}</span>
                </li>)}
              </ul>
              <Link href="/signup" onClick={() => track("plan_cta_clicked", { plan_id: plan.id, interval, current_plan_id: "anonymous" })}
                className="inline-flex min-h-12 items-center justify-between gap-3 rounded-lg border border-current/20 px-4 py-3 text-sm font-medium transition-colors hover:bg-white/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current dark:hover:bg-white/10">
                {tl("pricingCta")}<ArrowRight className="size-4 shrink-0" aria-hidden />
              </Link>
            </article>
          );
        })}
      </div>

      <div className="mt-7 flex flex-col gap-3 text-xs leading-relaxed text-muted-foreground sm:flex-row sm:justify-between sm:gap-8">
        <p>{tl("pricingNote")}</p>
        {!compact && <p>{tl("pricingSelfHostedNote")} {" "}
          <Link href={localizedHref("/self-hosting", locale as Locale)} className="font-medium text-foreground underline underline-offset-4">{tl("pricingSelfHostedCta")}</Link>
        </p>}
      </div>
    </div>
  );
}
