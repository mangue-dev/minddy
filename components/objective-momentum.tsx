"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Activity01Icon, AnalyticsDownIcon, AnalyticsUpIcon, Calendar01Icon, CancelCircleIcon as CircleSlash2, MinusSignIcon, CheckIcon } from "@hugeicons/core-free-icons";
import { AppIcon } from "@/components/icon";
import { useMemo } from "react";
import { useFormatter, useNow, useTimeZone, useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  objectiveMomentum,
  type ObjectiveMomentumState,
  type ObjectiveTargetPace,
} from "@/lib/objective-momentum";
import type { Issue, Objective } from "@/lib/types";
import type { MessageKey } from "@/lib/i18n-keys";

const STATE_META: Record<
  ObjectiveMomentumState,
  { key: MessageKey<"Objectives">; icon: AppIcon; className: string }
> = {
  accelerating: {
    key: "momentumAccelerating",
    icon: AnalyticsUpIcon,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  steady: {
    key: "momentumSteady",
    icon: MinusSignIcon,
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  slowing: {
    key: "momentumSlowing",
    icon: AnalyticsDownIcon,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  stalled: {
    key: "momentumStalled",
    icon: MinusSignIcon,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  not_started: {
    key: "momentumNotStarted",
    icon: MinusSignIcon,
    className: "bg-muted text-muted-foreground",
  },
  complete: {
    key: "momentumComplete",
    icon: CheckIcon,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  canceled: {
    key: "momentumCanceled",
    icon: CircleSlash2,
    className: "bg-muted text-muted-foreground",
  },
};

const PACE_META: Record<
  ObjectiveTargetPace,
  { key: MessageKey<"Objectives">; className: string }
> = {
  on_track: {
    key: "momentumTargetOnTrack",
    className: "text-emerald-700 dark:text-emerald-300",
  },
  at_risk: {
    key: "momentumTargetAtRisk",
    className: "text-amber-700 dark:text-amber-300",
  },
  overdue: {
    key: "momentumTargetOverdue",
    className: "text-rose-700 dark:text-rose-300",
  },
};

interface ObjectiveMomentumProps {
  objective: Objective;
  issues: Issue[];
}

/** Show momentum statistics only for objectives with a target date. */
export function ObjectiveMomentum({
  objective,
  issues,
}: ObjectiveMomentumProps) {
  if (!objective.target_date) return null;
  return <ObjectiveMomentumCard objective={objective} issues={issues} />;
}

/**
 * Show rhythm and finish estimates over the target period, with rolling
 * history when the date cannot define a valid period. Deadline progress uses
 * the same effort weighting and status credit as the objective page.
 */
function ObjectiveMomentumCard({ objective, issues }: ObjectiveMomentumProps) {
  const t = useTranslations("Objectives");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const timeZone = useTimeZone() ?? "UTC";
  const insight = useMemo(
    () => objectiveMomentum(objective, issues, now, timeZone),
    [objective, issues, now, timeZone],
  );
  const state = STATE_META[insight.state];
  const StateIcon = state.icon;
  const maxCompleted = Math.max(
    1,
    ...insight.intervals.map((interval) => interval.completed),
  );
  const titleId = `objective-momentum-${objective.id}`;
  const canceled = insight.state === "canceled";
  const SummaryIcon = canceled ? CircleSlash2 : Calendar01Icon;
  const pace = insight.targetPace ? PACE_META[insight.targetPace] : null;
  const periodDate = (value: string) =>
    format.dateTime(new Date(value), {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const periodStart = insight.period ? periodDate(insight.period.start) : "";
  const periodEnd = insight.period ? periodDate(insight.period.end) : "";
  const estimate = insight.forecastDate
    ? format.dateTime(new Date(insight.forecastDate), {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const forecast = (() => {
    if (canceled) return t("momentumCanceledSummary");
    if (insight.linkedIssues === 0) return t("momentumEmpty");
    if (insight.remainingIssues === 0) return t("momentumAllClosed");
    if (insight.targetPace === "overdue") {
      const overdue = t("momentumOverdue", { count: insight.remainingIssues });
      return estimate
        ? `${overdue} ${t("momentumForecast", { date: estimate })}`
        : overdue;
    }
    if (estimate) {
      const date = estimate;
      if (insight.targetPace === "at_risk") {
        return t("momentumForecastAtRisk", { date });
      }
      if (insight.targetPace === "on_track") {
        return t("momentumForecastOnTrack", { date });
      }
      return t("momentumForecast", { date });
    }
    if (insight.state === "stalled" && insight.lastCompletionAt) {
      return t("momentumLastCompletion", {
        time: format.relativeTime(new Date(insight.lastCompletionAt), now),
      });
    }
    return t("momentumForecastPending");
  })();

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-xl border border-border/70 bg-muted/20 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <HugeiconsIcon icon={Activity01Icon} className="size-4 shrink-0 text-muted-foreground" />
          <h2 id={titleId} className="text-sm font-medium">
            {t("momentumTitle")}
          </h2>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium",
            state.className,
          )}
        >
          <AppIcon icon={StateIcon} className="size-3.5" />
          {t(state.key)}
        </span>
      </div>

      {insight.period && !canceled ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("momentumPeriod", { start: periodStart, end: periodEnd })}
        </p>
      ) : null}

      {insight.linkedIssues > 0 && !canceled ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            {insight.period ? t("momentumPeriodCompleted", {
              count: insight.periodCompleted,
            }) : t("momentumRecentComparison", {
              recent: insight.recentCompleted,
              previous: insight.previousCompleted,
            })}
          </p>

          <div
            className="mt-4"
            role="img"
            aria-label={insight.period ? t("momentumPeriodHistoryLabel", {
              start: periodStart, end: periodEnd,
            }) : t("momentumHistoryLabel")}
          >
            <div className="flex h-20 items-end gap-1.5">
              {insight.intervals.map((interval, index) => {
                const start = new Date(interval.start);
                const end = new Date(interval.end);
                const future = start > now;
                const current = insight.period
                  ? start <= now && now < end
                  : index === insight.intervals.length - 1;
                const range = `${format.dateTime(start, {
                  day: "numeric",
                  month: "short",
                  ...(insight.period ? {} : { timeZone: "UTC" }),
                })} – ${format.dateTime(end, {
                  day: "numeric",
                  month: "short",
                  ...(insight.period ? {} : { timeZone: "UTC" }),
                })}`;
                const label = future
                  ? t("momentumFutureInterval", { range })
                  : t("momentumWeekCompleted", {
                      count: interval.completed,
                      range,
                    });
                return (
                  <Tooltip key={interval.start}>
                    <TooltipTrigger asChild>
                      <span className="flex h-full min-w-0 flex-1 items-end">
                        <span
                          className={cn(
                            "w-full rounded-sm transition-colors",
                            future
                              ? "border border-dashed border-foreground/20"
                              : interval.completed === 0
                                ? "bg-foreground/10"
                                : current
                                  ? "bg-emerald-500"
                                  : "bg-emerald-500/60",
                          )}
                          style={{
                            height:
                              interval.completed === 0
                                ? 4
                                : `${Math.max(14, (interval.completed / maxCompleted) * 100)}%`,
                          }}
                        />
                        <span className="sr-only">{label}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span>{insight.period ? periodStart : t("momentumEightWeeksAgo")}</span>
              <span>{insight.period ? periodEnd : t("momentumLastSevenDays")}</span>
            </div>
          </div>
        </>
      ) : null}

      {insight.period && insight.progressPercent !== null && !canceled ? (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            <span className="text-muted-foreground">
              {t("momentumTargetProgress", {
                progress: Math.round(insight.progressPercent),
                elapsed: Math.round(insight.elapsedPercent ?? 0),
              })}
            </span>
            {pace ? (
              <span className={cn("font-medium", pace.className)}>{t(pace.key)}</span>
            ) : null}
          </div>
          <div
            role="progressbar"
            aria-label={t("momentumProgressLabel")}
            aria-valuenow={Math.round(insight.progressPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="relative h-1.5 rounded-full bg-foreground/10"
          >
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${insight.progressPercent}%` }}
            />
            <span
              aria-hidden="true"
              className="absolute -top-0.5 h-2.5 w-0.5 -translate-x-1/2 bg-foreground/60"
              style={{ left: `${insight.elapsedPercent ?? 0}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-start gap-2 border-t border-border/60 pt-3 text-sm text-muted-foreground">
        <AppIcon icon={SummaryIcon} className="mt-0.5 size-4 shrink-0" />
        <p>{forecast}</p>
      </div>
    </section>
  );
}
