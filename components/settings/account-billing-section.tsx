"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Check, FolderKanban, Loader2, Ticket, Users } from "lucide-react";
import { Badge, Button, Separator, cn, toast } from "mangue-ui";
import { SettingsSection } from "@/components/settings-shell";
import { UsageBreakdownBody } from "@/components/usage-indicator";
import {
  BILLING_PLANS,
  billingPlanRank,
  type BillingPlan,
  type BillingPlanId,
} from "@/lib/billing-plans";
import {
  billingStatusQueryKey,
  billingUsageQueryKey,
  useBillingSummary,
} from "@/lib/use-billing-query";
import { createCheckoutApi, createPortalApi } from "@/lib/billing-api";

/**
 * Account → Billing (MIN-72) : plan courant + état d'abonnement Stripe, usage
 * de la fenêtre (corps partagé avec le popover du header) et les trois cartes
 * de plans. Upgrade sans abonnement → Checkout ; toute gestion d'un abonnement
 * existant (changement, annulation, factures) → Customer Portal.
 */

const PLAN_LABEL_KEYS: Record<BillingPlanId, "planFree" | "planGo" | "planPro"> = {
  free: "planFree",
  go: "planGo",
  pro: "planPro",
};

export function AccountBillingSection() {
  const t = useTranslations("Billing");
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { loading, status, usage, planId } = useBillingSummary();
  const [redirectingTo, setRedirectingTo] = useState<string | null>(null);

  // Retour de Checkout (?billing=success|cancelled) : toast une seule fois,
  // refetch (le webhook a pu arriver avant nous) et nettoyage de l'URL.
  const checkoutReturnHandled = useRef(false);
  const billingParam = searchParams.get("billing");
  useEffect(() => {
    if (!billingParam || checkoutReturnHandled.current) return;
    checkoutReturnHandled.current = true;
    if (billingParam === "success") {
      toast.success(t("checkoutSuccess"));
      void queryClient.invalidateQueries({ queryKey: billingStatusQueryKey });
      void queryClient.invalidateQueries({ queryKey: billingUsageQueryKey });
    } else if (billingParam === "cancelled") {
      toast(t("checkoutCancelled"));
    }
    router.replace("/settings?tab=billing", { scroll: false });
  }, [billingParam, queryClient, router, t]);

  const openPortal = useCallback(async () => {
    if (redirectingTo) return;
    setRedirectingTo("portal");
    try {
      window.location.href = await createPortalApi();
    } catch (error) {
      toast.error((error as Error).message);
      setRedirectingTo(null);
    }
  }, [redirectingTo]);

  const choosePlan = useCallback(
    async (target: BillingPlanId) => {
      if (redirectingTo) return;
      setRedirectingTo(target);
      try {
        // Un abonnement actif se gère (change/annule) dans le portal ; le
        // checkout ne sert qu'à la première souscription.
        const url = status?.subscription
          ? await createPortalApi()
          : await createCheckoutApi(target);
        window.location.href = url;
      } catch (error) {
        toast.error((error as Error).message);
        setRedirectingTo(null);
      }
    },
    [redirectingTo, status?.subscription]
  );

  const subscription = status?.subscription ?? null;
  const stripeConfigured = status?.stripeConfigured ?? false;

  return (
    <div className="space-y-8">
      <SettingsSection title={t("currentPlanTitle")} description={t("currentPlanSubtitle")}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold">
              {loading ? "—" : t(PLAN_LABEL_KEYS[planId])}
            </span>
            {subscription?.status && (
              <Badge
                variant={
                  subscription.status === "active" || subscription.status === "trialing"
                    ? "secondary"
                    : "destructive"
                }
              >
                {t(`subscriptionStatus_${normalizeStatus(subscription.status)}`)}
              </Badge>
            )}
            {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
              <span className="text-xs text-muted-foreground">
                {t("endsAt", { date: formatDate(subscription.currentPeriodEnd) })}
              </span>
            )}
          </div>
          {subscription && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openPortal()}
              disabled={redirectingTo !== null}
            >
              {redirectingTo === "portal" && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {t("manageSubscription")}
            </Button>
          )}
        </div>
      </SettingsSection>

      <Separator />

      <SettingsSection title={t("usageTitle")} description={t("usageSubtitle")}>
        <div className="rounded-lg border border-border bg-card">
          <UsageBreakdownBody bordered />
          {usage && (
            <div className="space-y-1.5 border-t border-border px-4 py-3 text-sm">
              <LimitRow
                icon={FolderKanban}
                label={t("limitProjects")}
                value={
                  usage.limits.maxProjects == null
                    ? t("unlimited")
                    : `${usage.limits.projectsUsed} / ${usage.limits.maxProjects}`
                }
              />
              <LimitRow
                icon={Ticket}
                label={t("limitIssuesPerProject")}
                value={
                  usage.limits.maxIssuesPerProject == null
                    ? t("unlimited")
                    : String(usage.limits.maxIssuesPerProject)
                }
              />
              <LimitRow
                icon={Bot}
                label={t("limitAgents")}
                value={usage.limits.allowAgents ? t("included") : t("notIncluded")}
              />
              <LimitRow
                icon={Users}
                label={t("limitMembers")}
                value={usage.limits.allowMembers ? t("included") : t("notIncluded")}
              />
            </div>
          )}
        </div>
      </SettingsSection>

      <Separator />

      <SettingsSection title={t("plansTitle")} description={t("plansSubtitle")}>
        <div className="grid gap-3 sm:grid-cols-3">
          {BILLING_PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentPlanId={planId}
              stripeConfigured={stripeConfigured}
              redirecting={redirectingTo === plan.id}
              disabled={redirectingTo !== null}
              onChoose={() => void choosePlan(plan.id)}
            />
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}

function LimitRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FolderKanban;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2.5 text-foreground/80">
        <Icon className="size-4 text-foreground/70" strokeWidth={2} />
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function PlanCard({
  plan,
  currentPlanId,
  stripeConfigured,
  redirecting,
  disabled,
  onChoose,
}: {
  plan: BillingPlan;
  currentPlanId: BillingPlanId;
  stripeConfigured: boolean;
  redirecting: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  const t = useTranslations("Billing");
  const isCurrent = plan.id === currentPlanId;
  const isUpgrade = billingPlanRank(plan.id) > billingPlanRank(currentPlanId);

  const features = [
    t("featureBudget", { amount: `$${plan.includedUsageUsd}` }),
    plan.maxProjects == null
      ? t("featureUnlimitedProjects")
      : t("featureMaxProjects", { n: plan.maxProjects }),
    plan.maxIssuesPerProject == null
      ? t("featureUnlimitedIssues")
      : t("featureMaxIssues", { n: plan.maxIssuesPerProject }),
    ...(plan.allowAgents ? [t("featureAgents")] : []),
    ...(plan.allowMembers ? [t("featureMembers")] : []),
  ];

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4",
        plan.highlighted ? "border-primary" : "border-border"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{t(PLAN_LABEL_KEYS[plan.id])}</span>
        {isCurrent && <Badge variant="secondary">{t("currentPlanBadge")}</Badge>}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums">
          {plan.priceEurMonthly === 0 ? "0 €" : `${plan.priceEurMonthly} €`}
        </span>
        <span className="text-xs text-muted-foreground">{t("perMonth")}</span>
      </div>
      <ul className="flex-1 space-y-1.5 text-xs text-muted-foreground">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-1.5">
            <Check className="mt-0.5 size-3 shrink-0 text-primary" strokeWidth={2.5} />
            {feature}
          </li>
        ))}
      </ul>
      {!isCurrent && plan.id !== "free" && stripeConfigured && (
        <Button
          size="sm"
          variant={isUpgrade ? "default" : "outline"}
          onClick={onChoose}
          disabled={disabled}
          className="gap-1.5"
        >
          {redirecting && <Loader2 className="size-3.5 animate-spin" />}
          {isUpgrade ? t("choosePlan") : t("switchPlan")}
        </Button>
      )}
    </div>
  );
}

/** Statuts Stripe → clés i18n bornées (les inconnus tombent sur "other"). */
function normalizeStatus(
  status: string
): "active" | "trialing" | "past_due" | "canceled" | "other" {
  if (
    status === "active" ||
    status === "trialing" ||
    status === "past_due" ||
    status === "canceled"
  ) {
    return status;
  }
  return "other";
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString();
}
