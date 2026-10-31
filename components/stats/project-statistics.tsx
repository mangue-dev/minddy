"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { issuesQueryFn } from "@/lib/issues-api";
import { useMembersQuery } from "@/lib/use-members-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { useIssueRelationsQuery } from "@/lib/use-issue-relations-query";
import { useProjectPullRequestStats } from "@/lib/use-project-pull-request-stats";
import { todayISO } from "@/lib/cycle";
import { displayName } from "@/lib/display-name";
import { durationParts, fmtNum } from "@/lib/stats-derive";
import {
  medianLeadTimeSeconds,
  momentum,
  projectHealth,
  pullRequestSummary,
  statusBreakdown,
  topContributors,
  weeklyFlow,
} from "@/lib/project-stats";
import type { Project } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusIndicator } from "@/components/issue-indicators";
import { UserAvatar } from "@/components/user-avatar";
import { IssueGraphCard } from "@/components/stats/issue-graph";
import { STATUS_TINT } from "@/components/stats/status-tint";
import { ALL_STATUSES } from "@/lib/issue-constants";
import { Metric, StatsCard, StatsSection } from "@/components/stats/stats-chrome";

/**
 * The statistics of one project (MIN-878), under its identity in the General
 * settings: the delivery momentum, where the tickets stand, the pull requests
 * when a repository is linked, who carries the work, and how the tickets link
 * to each other. Everything except the pull request dates comes from the
 * board's own caches, so an open board costs no extra request.
 */

interface BarSeries {
  key: string;
  label: string;
  /** Background class of the bar and its legend patch. */
  color: string;
  values: number[];
}

/** Side-by-side weekly bars, one group per week, with a legend and tooltips. */
function WeeklyBars({ weeks, series }: { weeks: string[]; series: BarSeries[] }) {
  const t = useTranslations("ProjectStats");
  const format = useFormatter();
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const weekLabel = (week: string) =>
    format.dateTime(new Date(`${week}T00:00:00`), { day: "numeric", month: "short" });
  const labelEvery = Math.max(1, Math.ceil(weeks.length / 6));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-36 items-end gap-1 border-b border-border">
        {weeks.map((week, index) => (
          <Tooltip key={week}>
            <TooltipTrigger asChild>
              <div className="flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] rounded-sm px-[2px] hover:bg-muted/60">
                {/* An empty series takes no room, so a lone bar stays centered
                    in its week instead of leaning on an invisible neighbour. */}
                {series.filter((s) => s.values[index] > 0).map((s) => (
                  <div
                    key={s.key}
                    className={cn("w-full max-w-3 rounded-t-[3px]", s.color)}
                    style={{ height: `${Math.max((s.values[index] / max) * 100, 3)}%` }}
                  />
                ))}
                <span className="sr-only">
                  {`${t("weekOf", { date: weekLabel(week) })}: ${series.map((s) => `${s.label} ${s.values[index]}`).join(", ")}`}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="min-w-40">
              <span className="font-medium">{t("weekOf", { date: weekLabel(week) })}</span>
              {series.map((s) => (
                <span key={s.key} className="mt-1 flex items-center justify-between gap-4 text-background/80">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("size-2 shrink-0 rounded-[2px]", s.color)} aria-hidden />
                    {s.label}
                  </span>
                  <span className="tabular-nums">{s.values[index]}</span>
                </span>
              ))}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="-mt-1.5 flex gap-1 text-[11px] tabular-nums text-muted-foreground">
        {weeks.map((week, index) => (
          <span key={week} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
            {index % labelEvery === 0 ? weekLabel(week) : ""}
          </span>
        ))}
      </div>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-[2px]", s.color)} aria-hidden />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** A duration in the units of the personal statistics (min, h, d). */
function useDuration() {
  const tStats = useTranslations("Stats");
  const locale = useLocale();
  return (seconds: number | null) => {
    if (seconds === null) return "—";
    const parts = durationParts(seconds);
    return tStats(parts.key, { value: fmtNum(parts.value, locale) });
  };
}

export function ProjectStatistics({ project }: { project: Project }) {
  const t = useTranslations("ProjectStats");
  const tStatus = useTranslations("Status");
  const duration = useDuration();

  // The board's own cache entries, as in the identity header above.
  const { data: issues } = useQuery({
    queryKey: ["issues", project.id],
    queryFn: issuesQueryFn(project.id),
  });
  const { relations } = useIssueRelationsQuery(project.id);
  const { members } = useMembersQuery(project.id, true);
  const { objectives } = useObjectivesQuery(project.id);
  const { pullRequests } = useProjectPullRequestStats(project.id);

  const today = todayISO();
  const stats = useMemo(() => {
    if (!issues) return null;
    return {
      flow: weeklyFlow(issues, today),
      momentum: momentum(issues, today),
      leadTime: medianLeadTimeSeconds(issues, today),
      statuses: statusBreakdown(issues),
      health: projectHealth(issues, today),
      contributors: topContributors(issues, today),
    };
  }, [issues, today]);
  const prs = useMemo(
    () => (issues ? pullRequestSummary(pullRequests, issues, today) : null),
    [pullRequests, issues, today],
  );

  if (!issues || !stats) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }
  if (issues.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  }

  const { momentum: pace, health } = stats;
  const changeHint =
    pace.changePercent === null
      ? t("changeNone")
      : pace.changePercent > 0
        ? t("changeUp", { percent: pace.changePercent })
        : pace.changePercent < 0
          ? t("changeDown", { percent: -pace.changePercent })
          : t("changeSteady");
  const backlogHint =
    pace.netFlow > 0 ? t("backlogGrowing") : pace.netFlow < 0 ? t("backlogShrinking") : t("backlogSteady");
  const weeks = stats.flow.map((week) => week.week);
  const total = issues.length;
  const memberById = new Map(members.map((member) => [member.user_id, member]));
  const contributionTotal = (contributor: (typeof stats.contributors)[number]) =>
    contributor.byStatus.reduce((sum, slice) => sum + slice.count, 0);
  const maxContribution = Math.max(1, ...stats.contributors.map(contributionTotal));
  // The legend names only the statuses the bars use.
  const contributorStatuses = ALL_STATUSES.filter(({ value }) =>
    stats.contributors.some((contributor) => contributor.byStatus.some((slice) => slice.status === value)));

  return (
    <div>
      <StatsSection title={t("momentumTitle")} description={t("momentumDescription")} className="mt-0">
        <StatsCard className="overflow-hidden p-0">
          <div className="grid gap-5 p-5 sm:grid-cols-3">
            <Metric
              label={t("completedRecent")}
              value={pace.completed}
              hint={changeHint}
              info={t("completedRecentInfo")}
            />
            <Metric
              label={t("backlogTrend")}
              value={pace.netFlow > 0 ? `+${pace.netFlow}` : pace.netFlow}
              hint={backlogHint}
              info={t("backlogTrendInfo")}
            />
            <Metric
              label={t("leadTime")}
              value={duration(stats.leadTime)}
              info={t("leadTimeInfo")}
            />
          </div>
          <div className="border-t border-border p-5">
            <WeeklyBars
              weeks={weeks}
              series={[
                {
                  key: "created",
                  label: t("flowCreated"),
                  color: "bg-muted-foreground/40",
                  values: stats.flow.map((week) => week.created),
                },
                {
                  key: "completed",
                  label: t("flowCompleted"),
                  // Done issues are green everywhere in the app.
                  color: STATUS_TINT.done.bg,
                  values: stats.flow.map((week) => week.completed),
                },
              ]}
            />
          </div>
        </StatsCard>
      </StatsSection>

      <StatsSection title={t("statusTitle")} description={t("statusDescription", { count: total })}>
        <StatsCard className="overflow-hidden p-0">
          <div className="p-5">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {stats.statuses.map((slice) => (
                <Tooltip key={slice.status}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn("h-full first:rounded-l-full last:rounded-r-full", STATUS_TINT[slice.status].bg)}
                      style={{ width: `${(slice.count / total) * 100}%` }}
                    >
                      <span className="sr-only">{`${tStatus(slice.status)}: ${slice.count}`}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("statusSlice", {
                      status: tStatus(slice.status),
                      count: slice.count,
                      percent: Math.round((slice.count / total) * 100),
                    })}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {stats.statuses.map((slice) => (
                <li key={slice.status} className="flex items-center gap-1.5">
                  <StatusIndicator status={slice.status} className="size-3.5" />
                  {tStatus(slice.status)}
                  <span className="tabular-nums text-foreground">{slice.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-5 border-t border-border p-5 sm:grid-cols-4">
            <Metric label={t("open")} value={health.open} />
            <Metric label={t("overdue")} value={health.overdue} info={t("overdueInfo")} />
            <Metric label={t("unassigned")} value={health.unassigned} info={t("unassignedInfo")} />
            <Metric label={t("stalled")} value={health.stalled} info={t("stalledInfo")} />
          </div>
        </StatsCard>
      </StatsSection>

      {prs && prs.total > 0 && (
        <StatsSection title={t("prTitle")} description={t("prDescription", { count: prs.total })}>
          <StatsCard className="overflow-hidden p-0">
            <div className="grid gap-5 p-5 sm:grid-cols-3">
              <Metric
                label={t("prMerged")}
                value={prs.merged}
                hint={t("prOpenClosed", { open: prs.open, closed: prs.closed })}
              />
              <Metric
                label={t("prMergeTime")}
                value={duration(prs.medianHoursToMerge === null ? null : prs.medianHoursToMerge * 3600)}
                info={t("prMergeTimeInfo")}
              />
              <Metric
                label={t("prShipped")}
                value={prs.shippedThroughPullRequestPercent === null ? "—" : `${prs.shippedThroughPullRequestPercent}%`}
                info={t("prShippedInfo")}
              />
            </div>
            <div className="border-t border-border p-5">
              <p className="mb-3 text-sm font-medium text-muted-foreground">{t("prMergedPerWeek")}</p>
              <WeeklyBars
                weeks={weeks}
                series={[{ key: "merged", label: t("prMerged"), color: "bg-[#AA41FF]", values: prs.mergedPerWeek }]}
              />
            </div>
          </StatsCard>
        </StatsSection>
      )}

      {stats.contributors.length > 0 && (
        <StatsSection title={t("contributorsTitle")} description={t("contributorsDescription")}>
          <StatsCard>
            <ul className="flex flex-col gap-3">
              {stats.contributors.map((contributor) => {
                const member = memberById.get(contributor.userId);
                const name = member ? displayName(member, t("formerMember")) : t("formerMember");
                return (
                  <li key={contributor.userId} className="flex items-center gap-3">
                    <UserAvatar seed={member?.avatar_seed ?? null} className="size-6" />
                    <span className="w-32 min-w-0 shrink-0 truncate text-sm sm:w-40">{name}</span>
                    <div className="flex h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      {contributor.byStatus.map((slice) => (
                        <Tooltip key={slice.status}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn("h-full", STATUS_TINT[slice.status].bg)}
                              style={{ width: `${(slice.count / maxContribution) * 100}%` }}
                            >
                              <span className="sr-only">{`${tStatus(slice.status)}: ${slice.count}`}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("contributorSlice", { name, status: tStatus(slice.status), count: slice.count })}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                      <span className="sr-only">{t("contributorTotal", { count: contributionTotal(contributor) })}</span>
                    </div>
                    <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {t("contributorFigures", { completed: contributor.completed, open: contributor.open })}
                    </span>
                  </li>
                );
              })}
            </ul>
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
              {contributorStatuses.map(({ value }) => (
                <li key={value} className="flex items-center gap-1.5">
                  <StatusIndicator status={value} className="size-3.5" />
                  {tStatus(value)}
                </li>
              ))}
            </ul>
          </StatsCard>
        </StatsSection>
      )}

      <IssueGraphCard project={project} issues={issues} relations={relations} objectives={objectives} />
    </div>
  );
}
