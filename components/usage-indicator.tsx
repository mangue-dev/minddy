"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  DashboardSpeedIcon,
  LoaderCircleIcon,
} from "@hugeicons/core-free-icons";
import { useCallback, useState } from "react";
import Link from "@/components/app-link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "@/components/ui/responsive-popover";
import { MobileSheetScrollArea } from "@/components/ui/mobile-sheet";
import { type BillingPlanId } from "@/lib/billing-plans";
import {
  roundRemainingPercent,
  useBillingSummary,
} from "@/lib/use-billing-query";
import { createCheckoutApi, createPortalApi } from "@/lib/billing-api";
import { usePurchasesHidden } from "@/lib/native-app";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { SIDEBAR_COMPACT_CONTROL_CLASS } from "@/lib/sidebar-control-styles";

import {
  UsageBudgetSummary,
  UsageSegmentBreakdown,
} from "@/components/billing/usage-budget";

const PLAN_LABEL_KEYS: Record<
  BillingPlanId,
  "planFree" | "planGo" | "planPro"
> = {
  free: "planFree",
  go: "planGo",
  pro: "planPro",
};

export function UsageIndicator({
  variant = "header",
  collapsed = false,
  onOpenChange,
}: {
  variant?: "header" | "sidebar";
  collapsed?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("Billing");
  const tIssueUI = useTranslations("IssueUI");
  const {
    usageLoading: loading,
    usageError,
    remainingPercent,
    state,
    usage,
  } = useBillingSummary();
  const [open, setOpen] = useState(false);
  const mobile = useMobileLayout() === true;
  const sidebar = variant === "sidebar";
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  if (usage && !usage.managedAi) return null;

  const stateClass =
    state === "exhausted" || state === "low"
      ? "text-destructive hover:text-destructive"
      : state === "warning"
        ? "text-warning-strong hover:text-warning-strong"
        : "text-muted-foreground hover:text-foreground";

  return (
    <ResponsivePopover open={open} onOpenChange={handleOpenChange}>
      <ResponsivePopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          // The name keeps the visible value (WCAG 2.5.3).
          aria-label={
            usage
              ? tIssueUI("fieldValueAria", {
                  field: t("usageAria"),
                  value: t("usagePercent", { percent: roundRemainingPercent(remainingPercent) }),
                })
              : t("usageAria")
          }
          className={cn(
            "gap-1.5 text-xs font-medium tabular-nums shadow-none",
            sidebar
              ? cn(
                  SIDEBAR_COMPACT_CONTROL_CLASS,
                  "text-sidebar-foreground/70 hover:text-sidebar-foreground",
                )
              : "h-8 rounded-full border border-border bg-card px-2.5 hover:bg-card",
            stateClass,
          )}
        >
          {(!sidebar || collapsed) && (
            <HugeiconsIcon
              icon={DashboardSpeedIcon}
              className="size-[15px]"
              strokeWidth={2}
            />
          )}
          {!collapsed
            ? loading
              ? "…"
              : usageError && !usage
                ? "—"
                : t("usagePercent", {
                    percent: roundRemainingPercent(remainingPercent),
                  })
            : null}
        </Button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        align="end"
        sideOffset={8}
        mobileTitle={t("usageAria")}
        className="w-80 max-w-[calc(100vw-1.25rem)] p-0"
      >
        <MobileSheetScrollArea>
          <UsageBreakdownBody compact touch={mobile} />
        </MobileSheetScrollArea>
        <UsageFooter onNavigate={() => handleOpenChange(false)} />
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
}

/** Shared usage content with a compact layout for the real account popover. */
export function UsageBreakdownBody({ compact = false, touch = false }: { compact?: boolean; touch?: boolean }) {
  return (
    <>
      <UsageBudgetSummary compact={compact} />
      <div className={cn("space-y-3 border-t border-border px-3", touch ? "py-1" : "py-3")}>
        <UsageSegmentBreakdown compact={compact} touch={touch} />
      </div>
    </>
  );
}

/**
 * CTA upgrade + link to the billing tab, under the body of the popover.
 * `onNavigate` lets the caller close their popover on click.
 */
function UsageFooter({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("Billing");
  const { status, planId } = useBillingSummary();
  const [redirecting, setRedirecting] = useState(false);
  const purchasesHidden = usePurchasesHidden();

  const nextPlanId: BillingPlanId | null =
    planId === "free" ? "go" : planId === "go" ? "pro" : null;
  const canUpgrade = nextPlanId !== null && (status?.stripeConfigured ?? false);

  const handleUpgrade = useCallback(async () => {
    if (!nextPlanId || redirecting) return;
    setRedirecting(true);
    try {
      const hasSubscription = !!status?.subscription;
      const url = hasSubscription
        ? await createPortalApi()
        : await createCheckoutApi(nextPlanId);
      window.location.href = url;
    } catch (error) {
      console.error("[usage-indicator] upgrade failed:", error);
      setRedirecting(false);
    }
  }, [nextPlanId, redirecting, status?.subscription]);

  // The mobile apps keep the usage figures and drop the way to a purchase
  // (MIN-907).
  if (purchasesHidden) return null;

  return (
    <div className="shrink-0 space-y-1 p-2">
      {canUpgrade && nextPlanId && (
        <Button
          type="button"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => void handleUpgrade()}
          disabled={redirecting}
        >
          {redirecting && (
            <HugeiconsIcon
              icon={LoaderCircleIcon}
              className="size-3.5 animate-spin"
            />
          )}
          {t("upgradeTo", { plan: t(PLAN_LABEL_KEYS[nextPlanId]) })}
        </Button>
      )}
      <Button
        asChild
        size="sm"
        variant={canUpgrade ? "ghost" : "outline"}
        className="w-full gap-1.5"
      >
        <Link href="/billing" onClick={onNavigate}>
          {t("viewBilling")}
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}
