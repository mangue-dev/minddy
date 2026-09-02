"use client";

import { useMemo } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  Activity,
  CalendarClock,
  Check,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "mangue-ui";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  objectiveMomentum,
  type ObjectiveMomentumState,
} from "@/lib/objective-momentum";
import type { Issue, Objective } from "@/lib/types";
import type { MessageKey } from "@/lib/i18n-keys";

const STATE_META: Record<
  ObjectiveMomentumState,
  { key: MessageKey<"Objectives">; icon: typeof Activity; className: string }
> = {
  accelerating: {
    key: "momentumAccelerating",
    icon: TrendingUp,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  steady: {
    key: "momentumSteady",
    icon: Minus,
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  slowing: {
    key: "momentumSlowing",
    icon: TrendingDown,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  stalled: {
    key: "momentumStalled",
    icon: Minus,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  not_started: {
    key: "momentumNotStarted",
    icon: Minus,
    className: "bg-muted text-muted-foreground",
  },
  complete: {
    key: "momentumComplete",
    icon: Check,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
};

/**
 * A plain-language objective health card: recent completions, an eight-week
 * rhythm, and a conservative finish estimate. It intentionally avoids exposing
 * effort points or statistical confidence controls; those mechanics support the
 * answer without becoming work the user has to interpret.
 */
export function ObjectiveMomentum({
  objective,
  issues,
}: {
  objective: Objective;
  issues: Issue[];
}) {
  const t = useTranslations("Objectives");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const insight = useMemo(
    () => objectiveMomentum(objective, issues, now),
    [objective, issues, now],
  );
  const state = STATE_META[insight.state];
  const StateIcon = state.icon;
  const maxWeek = Math.max(1, ...insight.weeks.map((week) => week.completed));
  const titleId = `objective-momentum-${objective.id}`;

  const forecast = (() => {
    if (insight.linkedIssues === 0) return t("momentumEmpty");
    if (insight.remainingIssues === 0) return t("momentumAllClosed");
    if (insight.targetPace === "overdue") {
      return t("momentumOverdue", { count: insight.remainingIssues });
    }
    if (insight.forecastDate) {
      const date = format.dateTime(new Date(insight.forecastDate), {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
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
          <Activity className="size-4 shrink-0 text-muted-foreground" />
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
          <StateIcon className="size-3.5" />
          {t(state.key)}
        </span>
      </div>

      {insight.linkedIssues > 0 ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("momentumRecentComparison", {
              recent: insight.recentCompleted,
              previous: insight.previousCompleted,
            })}
          </p>

          <div
            className="mt-4"
            role="img"
            aria-label={t("momentumHistoryLabel")}
          >
            <div className="flex h-20 items-end gap-1.5">
              {insight.weeks.map((week, index) => {
                const current = index === insight.weeks.length - 1;
                const start = new Date(week.start);
                const end = new Date(week.end);
                const range = `${format.dateTime(start, {
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                })} – ${format.dateTime(end, {
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                })}`;
                const label = t("momentumWeekCompleted", {
                  count: week.completed,
                  range,
                });
                return (
                  <Tooltip key={week.start}>
                    <TooltipTrigger asChild>
                      <span className="flex h-full min-w-0 flex-1 items-end">
                        <span
                          className={cn(
                            "w-full rounded-sm transition-colors",
                            week.completed === 0
                              ? "bg-foreground/10"
                              : current
                                ? "bg-emerald-500"
                                : "bg-emerald-500/60",
                          )}
                          style={{
                            height:
                              week.completed === 0
                                ? 4
                                : `${Math.max(14, (week.completed / maxWeek) * 100)}%`,
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
              <span>{t("momentumEightWeeksAgo")}</span>
              <span>{t("momentumLastSevenDays")}</span>
            </div>
          </div>
        </>
      ) : null}

      <div className="mt-4 flex items-start gap-2 border-t border-border/60 pt-3 text-sm text-muted-foreground">
        <CalendarClock className="mt-0.5 size-4 shrink-0" />
        <p>{forecast}</p>
      </div>
    </section>
  );
}
