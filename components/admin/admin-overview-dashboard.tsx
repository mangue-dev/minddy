"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Skeleton,
  cn,
} from "mangue-ui";
import {
  Metric,
  StatsCard,
  StatsSection,
  StatsSectionHeader,
  TotalItem,
} from "@/components/stats/stats-chrome";
import type { AdminOverview, AdminOverviewDay } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * `/admin` → “Overview” tab (MIN-90): the app seen from above —
 * how many accounts, how many live, where they are.
 *
 * The screen deliberately uses the chrome of `/statistics` (`stats-chrome`):
 * same map, same title-off-map hierarchy, same figure weight. An admin
 * doesn't have to learn a second visual grammar to read meters.
 *
 * Two series can be read here — actives per day and registrations per day. They don't
 * NOT share a chart: two twin bands, each with its own
 * scale and its title. Superimpose two measurements of different amplitudes on a
 * same axis would crush the smallest (the inscriptions) until invisible.
 */

/** A 30-day strip, one bar per day, one measurement. */
function DayStrip({
  days,
  label,
  pick,
  emptyLabel,
}: {
  days: AdminOverviewDay[];
  label: string;
  pick: (day: AdminOverviewDay) => number;
  emptyLabel: string;
}) {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const max = useMemo(
    () => days.reduce((m, d) => Math.max(m, pick(d)), 0),
    [days, pick],
  );

  const dayLabel = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

  if (days.length === 0 || max === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-16 items-end gap-[2px]">
        {days.map((day) => {
          const value = pick(day);
          // A day at 1 must remain visible next to a day at 30:
          // height floor for any non-zero value.
          const height = value === 0 ? 0 : Math.max((value / max) * 100, 8);
          return (
            // The hover target is the entire COLUMN, not the bar: aim
            // 2 px high on a zero day would be impossible.
            <Tooltip key={day.day}>
              <TooltipTrigger asChild>
                <div className="flex h-full flex-1 items-end">
                  {/* Bar anchored to the baseline: only the top is rounded —
 a rounded bottom would cause the bar to float above zero. */}
                  <div
                    className={cn(
                      "w-full rounded-t-[3px] transition-[height]",
                      value === 0 ? "h-px bg-border" : "bg-foreground/70",
                    )}
                    style={value === 0 ? undefined : { height: `${height}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-medium">{dayLabel(day.day)}</span>
                <span className="block text-background/70">
                  {t("overview.tooltipValue", { label, value })}
                </span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{dayLabel(days[0].day)}</span>
        <span>{dayLabel(days[days.length - 1].day)}</span>
      </div>
    </div>
  );
}

/** Distribution by plan: a line, a bar, the percentage share. */
function PlanRow({
  planId,
  count,
  max,
  total,
}: {
  planId: string;
  count: number;
  max: number;
  total: number;
}) {
  const width = max > 0 ? (count / max) * 100 : 0;
  const share = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate">{planId}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">{count}</span>
          <span className="ml-1.5 text-xs">{share}%</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground/70 transition-all"
          style={{ width: `${Math.max(width, count > 0 ? 3 : 0)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The onboarding funnel as ONE stacked band (MIN-416): completed, started
 * but not completed, and never-presented read as proportions of the same
 * whole — four detached tiles said nothing about how the stages compare.
 * The segments are a strict partition of the accounts. Neutral tints only:
 * the reading order does the work, not color.
 */
function FunnelBand({
  segments,
}: {
  segments: Array<{ label: string; count: number; className: string }>;
}) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          segments.map((s) => (
            <Tooltip key={s.label}>
              <TooltipTrigger asChild>
                <div
                  className={cn("h-full transition-all", s.className)}
                  style={{ width: `${(s.count / total) * 100}%` }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-medium">{s.label}</span>
                <span className="block text-background/70 tabular-nums">
                  {s.count} · {Math.round((s.count / total) * 100)}%
                </span>
              </TooltipContent>
            </Tooltip>
          ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-[3px]", s.className)} aria-hidden />
            {s.label}
            <span className="tabular-nums">{s.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function AdminOverviewDashboard() {
  const t = useTranslations("Admin");
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // The days are divided into the time zone of the admin who is watching:
      // “active today” must mean today in their time zone.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await fetch(
        `/api/admin/overview?tz=${encodeURIComponent(tz || "UTC")}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData((await response.json()) as AdminOverview);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pickActive = useCallback((day: AdminOverviewDay) => day.active, []);
  const pickSignups = useCallback((day: AdminOverviewDay) => day.signups, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }
  if (error || !data) {
    return <p className="text-sm text-destructive">{error ?? "—"}</p>;
  }

  const maxPlan = data.plans.reduce((m, p) => Math.max(m, p.count), 0);
  const notStarted = Math.max(data.totalUsers - data.onboarding.started, 0);

  return (
    <div>
      {/* 1 — The present: how many accounts, how many live. */}
      <StatsCard className="grid grid-cols-1 gap-5 divide-y divide-border sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-y-0">
        <Metric
          variant="hero"
          className="sm:pr-5"
          label={t("overview.totalUsers")}
          value={data.totalUsers}
          // A total that decreases because an internal account has been marked must
          // explain yourself on the spot, otherwise the figure becomes suspect.
          hint={
            <>
              {t("overview.newUsers", { count: data.newUsers7d })}
              {data.internalUsers > 0 ? (
                <span className="block">
                  {t("overview.internalExcluded", { count: data.internalUsers })}
                </span>
              ) : null}
            </>
          }
          info={data.internalUsers > 0 ? t("overview.internalInfo") : undefined}
        />
        <Metric
          variant="hero"
          className="pt-5 sm:px-5 sm:pt-0"
          label={t("overview.activeWeek")}
          value={data.active7d}
          hint={t("overview.activeMonth", { count: data.active30d })}
          info={t("overview.activeInfo")}
        />
        <Metric
          variant="hero"
          className="pt-5 sm:pl-5 sm:pt-0"
          label={t("overview.activeToday")}
          value={data.activeToday}
          hint={t("overview.signupsToday", {
            count: data.days.at(-1)?.signups ?? 0,
          })}
        />
      </StatsCard>

      {/* 2 — The last 30 days, two twin bands (never superimposed). */}
      <StatsSection title={t("overview.activity")} info={t("overview.activeInfo")}>
        <StatsCard className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <StatsSectionHeader title={t("overview.activeDaily")} />
            <DayStrip
              days={data.days}
              label={t("overview.activeDaily")}
              pick={pickActive}
              emptyLabel={t("overview.noActivity")}
            />
          </div>
          <div className="flex flex-col gap-3">
            <StatsSectionHeader title={t("overview.signupsDaily")} />
            <DayStrip
              days={data.days}
              label={t("overview.signupsDaily")}
              pick={pickSignups}
              emptyLabel={t("overview.noSignups")}
            />
          </div>
        </StatsCard>
      </StatsSection>

      {/* 3 — Where are the newcomers? The funnel reads as proportions of the
          same whole; the tiles below keep the exact counts. */}
      <StatsSection
        title={t("overview.onboarding")}
        info={t("overview.onboardingInfo")}
      >
        <StatsCard className="flex flex-col gap-5">
          <FunnelBand
            segments={[
              {
                label: t("overview.onboardingCompleted"),
                count: data.onboarding.completed,
                className: "bg-foreground/70",
              },
              {
                label: t("overview.onboardingStarted"),
                count: Math.max(data.onboarding.started - data.onboarding.completed, 0),
                className: "bg-foreground/35",
              },
              {
                label: t("overview.onboardingNeverSeen"),
                count: notStarted,
                className: "bg-border",
              },
            ]}
          />
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <TotalItem
              label={t("overview.onboardingStarted")}
              value={data.onboarding.started}
            />
            <TotalItem
              label={t("overview.onboardingCompleted")}
              value={data.onboarding.completed}
            />
            <TotalItem
              label={t("overview.onboardingDismissed")}
              value={data.onboarding.dismissed}
            />
            <TotalItem
              label={t("overview.onboardingNeverSeen")}
              value={notStarted}
            />
          </div>
        </StatsCard>
      </StatsSection>

      {/* 4 — Ce qu'ils paient. */}
      <StatsSection title={t("overview.plans")} info={t("overview.plansInfo")}>
        <StatsCard className="flex flex-col gap-4">
          {data.plans.map((plan) => (
            <PlanRow
              key={plan.planId}
              planId={plan.planId}
              count={plan.count}
              max={maxPlan}
              total={data.totalUsers}
            />
          ))}
        </StatsCard>
      </StatsSection>

      {/* 5 — The base: what the app contains. */}
      <StatsSection title={t("overview.content")}>
        <StatsCard className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <TotalItem
            label={t("overview.totalProjects")}
            value={data.totalProjects}
          />
          <TotalItem label={t("overview.totalIssues")} value={data.totalIssues} />
          <TotalItem
            label={t("overview.newUsers30d")}
            value={data.newUsers30d}
          />
          <TotalItem
            label={t("overview.issuesPerProject")}
            value={
              data.totalProjects > 0
                ? Math.round((data.totalIssues / data.totalProjects) * 10) / 10
                : 0
            }
          />
        </StatsCard>
      </StatsSection>
    </div>
  );
}
