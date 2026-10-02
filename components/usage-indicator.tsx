"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  DashboardSpeedIcon,
  LoaderCircleIcon,
} from "@hugeicons/core-free-icons";
import { useCallback, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from "mangue-ui";
import { type BillingPlanId } from "@/lib/billing-plans";
import {
  roundRemainingPercent,
  useBillingSummary,
} from "@/lib/use-billing-query";
import { createCheckoutApi, createPortalApi } from "@/lib/billing-api";
import { SIDEBAR_COMPACT_CONTROL_CLASS } from "@/lib/sidebar-control-styles";

import {
  UsageBudgetSummary,
  UsageSegmentBreakdown,
} from "@/components/billing/usage-budget";

export { SEGMENT_UI } from "@/components/billing/usage-segment-ui";

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
  const {
    usageLoading: loading,
    usageError,
    remainingPercent,
    state,
    usage,
  } = useBillingSummary();
  const [open, setOpen] = useState(false);
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
        ? "text-amber-600 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-400"
        : "text-muted-foreground hover:text-foreground";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("usageAria")}
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
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={sidebar ? 10 : 8}
        className="w-80 max-w-[calc(100vw-1.25rem)] p-0"
      >
        <UsageBreakdownBody compact />
        <UsageFooter onNavigate={() => handleOpenChange(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** Shared usage content with a compact layout for the real account popover. */
export function UsageBreakdownBody({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Billing");
  return (
    <>
      <UsageBudgetSummary compact={compact} />
      <div className="space-y-3 border-t border-border px-3 py-3">
        <p className="text-xs text-muted-foreground">
          {t("segmentBudgetHint")}
        </p>
        <UsageSegmentBreakdown compact={compact} />
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

  return (
    <div className="space-y-1 p-2">
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
