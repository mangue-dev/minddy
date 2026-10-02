"use client";

import { useLocale, useTranslations } from "next-intl";
import { Badge, Button, Progress, Skeleton, cn } from "mangue-ui";
import { USAGE_SEGMENTS, type UsageSegmentId } from "@/lib/billing-plans";
import {
  useBillingSummary,
  formatBudgetPercent,
  roundRemainingPercent,
} from "@/lib/use-billing-query";
import { AppIcon } from "@/components/icon";
import { SEGMENT_UI } from "@/components/billing/usage-segment-ui";
import { CARD_TONES } from "@/components/marketing/card-tones";

export const SEGMENT_CHART_UI: Record<
  UsageSegmentId,
  { fill: string; progress: string }
> = {
  agents: { fill: "fill-violet-500", progress: "[&>div]:bg-violet-500" },
  routines: { fill: "fill-sky-500", progress: "[&>div]:bg-sky-500" },
  numo: { fill: "fill-blue-500", progress: "[&>div]:bg-blue-500" },
  dictation: { fill: "fill-amber-500", progress: "[&>div]:bg-amber-500" },
  feedback: { fill: "fill-emerald-500", progress: "[&>div]:bg-emerald-500" },
  automations: { fill: "fill-fuchsia-500", progress: "[&>div]:bg-fuchsia-500" },
};

export function UsageLoadError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("Billing");
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 p-4"
      role="alert"
    >
      <p className="text-sm text-muted-foreground">{t("usageLoadFailed")}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        {t("retryUsage")}
      </Button>
    </div>
  );
}

/** The page and popover share exactly the same budget, meter, and reset date. */
export function UsageBudgetSummary({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Billing");
  const locale = useLocale();
  const {
    usage,
    planId,
    usageLoading,
    usageError,
    retryUsage,
    remainingPercent,
    usedUsd,
    includedUsd,
    segments,
    state,
  } = useBillingSummary();
  if (usageError && !usage)
    return <UsageLoadError onRetry={() => void retryUsage()} />;
  const date = usage
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(
        new Date(usage.nextResetAt),
      )
    : null;
  const period = usage
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" })
    : null;
  const consumed =
    usedUsd === 0 ? "0%" : formatBudgetPercent(usedUsd, includedUsd, locale);
  // Normalize only the meter on overruns; text keeps the actual consumed percentage.
  const denominator = Math.max(includedUsd, usedUsd);
  const tone =
    planId === "pro"
      ? CARD_TONES.lavender
      : planId === "go"
        ? CARD_TONES.butter
        : CARD_TONES.sky;
  return (
    <div
      className={cn(
        compact
          ? "space-y-3 px-3 pb-3 pt-3"
          : "grid gap-5 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8 sm:p-6",
      )}
    >
      <div className="min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {t("budgetTitle")}
          </span>
          <Badge variant="secondary" className={cn("shrink-0", tone)}>
            {t(
              planId === "pro"
                ? "planPro"
                : planId === "go"
                  ? "planGo"
                  : "planFree",
            )}
          </Badge>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {usageLoading ? (
            <Skeleton className={compact ? "h-8 w-20" : "h-11 w-28"} />
          ) : (
            <span
              className={cn(
                "font-semibold tabular-nums tracking-tight",
                compact ? "text-3xl" : "text-4xl",
                state === "low" || state === "exhausted"
                  ? "text-destructive"
                  : state === "warning"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-foreground",
              )}
            >
              {roundRemainingPercent(remainingPercent)}%
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            {t("budgetRemaining")}
          </span>
        </div>
        {usageLoading ? (
          <Skeleton className="h-2 w-full" />
        ) : (
          <div
            className="flex h-2 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={t("budgetMeterLabel", {
              used: consumed,
              remaining: `${roundRemainingPercent(remainingPercent)}%`,
            })}
          >
            {USAGE_SEGMENTS.map((segment) => (
              <div
                key={segment.id}
                className={cn("h-full", segment.barClass)}
                style={{
                  width: `${denominator > 0 ? ((segments.find((s) => s.id === segment.id)?.usd ?? 0) / denominator) * 100 : 0}%`,
                }}
              />
            ))}
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {usageLoading ? "—" : t("budgetConsumed", { percent: consumed })}
          </span>
          <span>
            {compact && date ? t("resetsAt", { date }) : t("budgetIncluded")}
          </span>
        </div>
        {!compact && usage && period && (
          <p className="text-xs text-muted-foreground">
            {t("budgetPeriod", {
              start: period.format(new Date(usage.periodStart)),
              end: period.format(new Date(usage.nextResetAt)),
            })}
          </p>
        )}
      </div>
      {!compact && (
        <div className="flex flex-col justify-center gap-1 border-t border-border pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          <span className="text-xs text-muted-foreground">
            {t("budgetReset")}
          </span>
          {usageLoading ? (
            <Skeleton className="h-6 w-28" />
          ) : (
            <span className="text-lg font-medium">{date ?? "—"}</span>
          )}
          <span className="text-xs text-muted-foreground">
            {t("budgetResetHint")}
          </span>
        </div>
      )}
    </div>
  );
}

export function UsageSegmentBreakdown({
  compact = false,
}: {
  compact?: boolean;
}) {
  const t = useTranslations("Billing");
  const locale = useLocale();
  const { usageLoading, usageError, usage, segments, includedUsd } =
    useBillingSummary();
  if (usageError && !usage) return null;
  return (
    <ul className={cn("min-w-0", compact ? "space-y-2" : "space-y-4")}>
      {USAGE_SEGMENTS.map((segment) => {
        const ui = SEGMENT_UI[segment.id];
        const usd = segments.find((s) => s.id === segment.id)?.usd ?? 0;
        return (
          <li key={segment.id} className="space-y-1.5">
            <div className="flex items-start justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-start gap-2">
                <AppIcon
                  icon={ui.icon}
                  strokeWidth={2}
                  className={cn("mt-0.5 size-4 shrink-0", ui.text)}
                />
                <span className="min-w-0 break-words">{t(ui.labelKey)}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {usageLoading
                  ? "—"
                  : usd === 0
                    ? "0%"
                    : formatBudgetPercent(usd, includedUsd, locale)}
              </span>
            </div>
            {!compact && (
              <Progress
                aria-label={t(ui.labelKey)}
                value={
                  includedUsd > 0 ? Math.min(100, (usd / includedUsd) * 100) : 0
                }
                className={cn("h-1", SEGMENT_CHART_UI[segment.id].progress)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
