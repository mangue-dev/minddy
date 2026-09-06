"use client";

import { useCallback, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Gift } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  cn,
  toast,
} from "mangue-ui";
import {
  BILLING_PLANS,
  annualPriceEur,
  annualMonthlyEquivalentEur,
  type BillingInterval,
  type BillingPlanId,
} from "@/lib/billing-plans";
import { planFeatureLabels } from "@/lib/plan-features";
import { CARD_TONES } from "@/components/marketing/card-tones";
import { billingStatusQueryKey, useBillingSummary } from "@/lib/use-billing-query";
import {
  createCheckoutApi,
  createPortalApi,
  setCancelAtPeriodEndApi,
} from "@/lib/billing-api";

/**
 * The billing page plan cards share the marketing palette and layout, with
 * an inline “Current plan” badge and subscription-specific actions.
 * Usage is stated as a multiple of Free
 * (“10× more usage”), never as a monetary amount.
 *
 * Monthly/annual switch (2 months free): only affects CHECKOUT (new
 * subscription). An active subscriber changes plan or billing cadence through
 * the Customer Portal.
 *
 * Cancellation no longer goes through the portal (MIN-296): “click-to-cancel”
 * requires no more gestures than subscribing. It is handled here with a button
 * and confirmation for the end of the period, and the same card offers to
 * resume while that date has not passed.
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

const PLAN_TONES: Record<BillingPlanId, string> = {
  free: CARD_TONES.sky,
  go: CARD_TONES.butter,
  pro: CARD_TONES.lavender,
};

export function PlanSection() {
  const t = useTranslations("Billing");
  const locale = useLocale();
  const { loading, status, planId } = useBillingSummary();
  const queryClient = useQueryClient();
  const [submittingPlanId, setSubmittingPlanId] = useState<string | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const hasSubscription = !!status?.subscription;
  const cancelPending = status?.subscription?.cancelAtPeriodEnd ?? false;
  const periodEnd = status?.subscription?.currentPeriodEnd ?? null;
  const stripeConfigured = status?.stripeConfigured ?? false;

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

  /** Cancel / resume, without leaving the app. */
  const setCancel = useCallback(
    async (cancel: boolean) => {
      setSubmittingPlanId("free");
      try {
        await setCancelAtPeriodEndApi(cancel);
        await queryClient.invalidateQueries({ queryKey: billingStatusQueryKey });
        toast.success(cancel ? t("cancelDone") : t("resumeDone"));
      } catch (error) {
        toast.error((error as Error).message);
      } finally {
        setSubmittingPlanId(null);
        setConfirmCancelOpen(false);
      }
    },
    [queryClient, t]
  );

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

  // The self-hosted edition does not have any Stripe products to offer. Do not return
  // deactivated cards: they would make it appear as if a purchase was required for the
  // core while only cloud capabilities are optional.
  if (!loading && !status?.managedBilling) return null;

  const adminOverride = status?.adminOverride ?? null;
  if (adminOverride) {
    const basePlanLabel = t(PLAN_LABEL_KEYS[adminOverride.basePlanId]);
    const overridePlanLabel = t(PLAN_LABEL_KEYS[planId]);
    const expiresAt = adminOverride.expiresAt;

    return (
      <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/8 to-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
            <Gift className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground">
              {t("adminOverrideTitle", { plan: overridePlanLabel })}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {expiresAt
                ? t("adminOverrideTemporaryDescription", {
                    date: new Intl.DateTimeFormat(locale, {
                      dateStyle: "long",
                    }).format(new Date(expiresAt)),
                    plan: basePlanLabel,
                  })
                : t("adminOverrideUnlimitedDescription", {
                    plan: basePlanLabel,
                  })}
            </p>
            {cancelPending && periodEnd && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("cancelScheduled", {
                  date: new Intl.DateTimeFormat(locale, {
                    dateStyle: "long",
                  }).format(new Date(periodEnd)),
                })}
              </p>
            )}
            {hasSubscription && (
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                disabled={submittingPlanId !== null}
                onClick={() => void openPortal("admin-override")}
              >
                {submittingPlanId === "admin-override"
                  ? t("loading")
                  : t("manageSubscription")}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Monthly/yearly switch — yearly billing includes two free months. */}
      <div className="flex">
        <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl bg-[#f3f1ed] p-1.5 text-sm font-medium dark:bg-[#252525]">
          <button
            type="button"
            aria-pressed={interval === "month"}
            onClick={() => setInterval("month")}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              interval === "month"
                ? "bg-white text-foreground dark:bg-[#414141]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("billingMonthly")}
          </button>
          <button
            type="button"
            aria-pressed={interval === "year"}
            onClick={() => setInterval("year")}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              interval === "year"
                ? "bg-white text-foreground dark:bg-[#414141]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("billingYearly")}
            <span className="text-xs font-normal opacity-70">
              {t("yearlySavings")}
            </span>
          </button>
        </div>
      </div>

      {/* The date makes a pending cancellation concrete: what remains and for how long. */}
      {cancelPending && periodEnd && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
          {t("cancelScheduled", {
            date: new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
              new Date(periodEnd)
            ),
          })}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-y-0">
        {BILLING_PLANS.map((plan) => {
          const isCurrent = plan.id === planId;
          const isFreeCard = plan.id === "free";
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
            // Return to Free = cancel. Two gestures, here, without going through
            // Stripe (MIN-296); and if it's already done, undo the button.
            ctaLabel = cancelPending ? t("resumeSubscription") : t("cancelSubscription");
            if (hasSubscription) {
              onAction = cancelPending
                ? () => void setCancel(false)
                : () => setConfirmCancelOpen(true);
            }
          } else {
            ctaLabel = t("switchToPlan", { plan: t(PLAN_LABEL_KEYS[plan.id]) });
            if (hasSubscription) onAction = () => void openPortal(plan.id);
            else if (stripeConfigured)
              onAction = () => void startCheckout(plan.id, interval);
          }

          const disabled = loading || submittingPlanId !== null || !onAction;

          return (
            <article
              key={plan.id}
              className={cn(
                "flex min-w-0 flex-col rounded-2xl p-6 md:row-span-5 md:grid md:grid-rows-subgrid md:gap-y-0 lg:p-8",
                PLAN_TONES[plan.id]
              )}
            >
              <div className="mb-5 flex min-h-7 flex-wrap items-center justify-between gap-2">
                <h3 className="text-2xl font-medium tracking-tight">
                  {t(PLAN_LABEL_KEYS[plan.id])}
                </h3>
                {isCurrent && (
                  <span className="rounded-md bg-white/45 px-2.5 py-1 text-xs font-medium dark:bg-white/10">
                    {t("currentPlanBadge")}
                  </span>
                )}
              </div>
              <p className="min-h-12 text-sm leading-relaxed opacity-80">
                {t(PLAN_DESC_KEYS[plan.id])}
              </p>

              <div className="my-8">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-5xl font-medium tracking-[-0.05em]">
                    {formatEur(displayPriceEur)} €
                  </span>
                  <span className="text-sm opacity-75">
                    {isFreeCard ? t("forever") : t("perMonth")}
                  </span>
                </div>
                <p className="mt-3 min-h-10 text-xs leading-relaxed opacity-75">
                  {showYearly
                    ? t("billedYearly", { total: formatEur(annualPriceEur(plan)) })
                    : " "}
                </p>
              </div>

              <ul className="mb-9 flex-1 space-y-3.5">
                {planFeatureLabels(plan, t).map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm leading-relaxed">
                    <Check className="mt-1 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={disabled}
                onClick={onAction}
                className="inline-flex min-h-12 items-center justify-between gap-3 rounded-lg border border-current/20 px-4 py-3 text-left text-sm font-medium transition-colors enabled:hover:bg-white/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current disabled:cursor-default disabled:opacity-50 dark:enabled:hover:bg-white/10"
              >
                <span>{submittingPlanId === plan.id ? t("loading") : ctaLabel}</span>
                {onAction && <ArrowRight className="size-4 shrink-0" aria-hidden />}
              </button>
            </article>
          );
        })}
      </div>

      <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cancelConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {periodEnd
                ? t("cancelConfirmDescription", {
                    date: new Intl.DateTimeFormat(locale, {
                      dateStyle: "long",
                    }).format(new Date(periodEnd)),
                  })
                : t("cancelConfirmDescriptionNoDate")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelConfirmKeep")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void setCancel(true);
              }}
            >
              {t("cancelConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
