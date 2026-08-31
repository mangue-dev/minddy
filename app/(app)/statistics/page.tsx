"use client";

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Button, cn } from "mangue-ui";
import { BarChart3, Plus } from "lucide-react";
import { useStatsQuery } from "@/lib/use-stats-query";
import { useCreate } from "@/lib/create-context";
import { useProjects } from "@/lib/projects-context";
import { useAuth } from "@/lib/auth-context";
import { authDisplayName, type AuthNameMeta } from "@/lib/display-name";
import { useMyAvatarSource } from "@/lib/use-my-avatar";
import {
  computeStreaks,
  dayInZone,
  fmtNum,
  heatmapTotals,
} from "@/lib/stats-derive";
import { trackEvent } from "@/lib/analytics";
import { useTrackView } from "@/lib/use-track-view";
import { EmptyScene } from "@/components/empty-scene";
import { AppContentHeader } from "@/components/app-content-header";
import { EffortDurations } from "@/components/stats/effort-durations";
import { MentionChip } from "@/components/mention-chip";
import { StatsHero } from "@/components/stats/stats-hero";
import { StatsSkeleton } from "@/components/stats/stats-skeleton";
import { WorkLandscape } from "@/components/stats/work-landscape";
import { useScrollFade } from "@/lib/use-scroll-fade";
import {
  Metric,
  StatsCard,
  StatsSection,
  TotalItem,
} from "@/components/stats/stats-chrome";
import type { StatsCycles } from "@/lib/types";

/**
 * Personal activity story (MIN-433): annual activity, where the work landed,
 * then quieter rhythm details and lifetime context.
 */

/** Current workload, cycle pace, due-date cadence, and median time by effort. */
function RhythmSection({
  cycles,
  workload,
}: {
  cycles: StatsCycles;
  workload: { assignedOpen: number; inProgress: number };
}) {
  const t = useTranslations("Stats");
  const locale = useLocale();

  const showPerCycle = cycles.cycleCount > 0;
  const showCadence = cycles.completionOffsetSample > 0;
  const showEffort = cycles.byEffort.length > 0;
  const summaryCount = 1 + Number(showPerCycle) + Number(showCadence);
  // Cadence: absolute gap in days, paired with its early/late direction.
  const offset = cycles.avgCompletionOffsetDays;
  let cadenceValue = "—";
  let cadenceHint: string | undefined;
  if (offset !== null) {
    const rounded = Math.round(Math.abs(offset) * 10) / 10;
    if (rounded < 0.05) {
      // Exactly on the due date: the value is sufficient without a hint.
      cadenceValue = t("cadenceOnTimeValue");
    } else {
      cadenceValue = t("cadenceDays", { value: fmtNum(rounded, locale) });
      cadenceHint = offset < 0 ? t("cadenceEarly") : t("cadenceLate");
    }
  }

  return (
    <StatsSection title={t("rhythm")}>
      <StatsCard className="overflow-hidden p-0">
        <div
          className={cn(
            "grid gap-5 p-5",
            summaryCount === 2 && "sm:grid-cols-2",
            summaryCount === 3 && "sm:grid-cols-3",
          )}
        >
          <Metric
            label={t("workload")}
            value={workload.assignedOpen}
            hint={t("workloadInProgress", { count: workload.inProgress })}
            info={t("workloadInfo")}
          />
          {showPerCycle && (
            <Metric
              label={t("cycleTickets")}
              value={
                cycles.avgIssuesPerCycle !== null
                  ? fmtNum(cycles.avgIssuesPerCycle, locale)
                  : "—"
              }
              hint={t("cycleCount", { count: cycles.cycleCount })}
              info={t("cycleTicketsInfo")}
            />
          )}
          {showCadence && (
            <Metric
              label={t("cadence")}
              value={cadenceValue}
              hint={cadenceHint}
              info={t("cadenceInfo")}
            />
          )}
        </div>

        {showEffort && (
          <div className="border-t border-border p-5">
            <EffortDurations byEffort={cycles.byEffort} />
          </div>
        )}
      </StatsCard>
    </StatsSection>
  );
}

export default function StatisticsPage() {
  const t = useTranslations("Stats");
  const tProjects = useTranslations("Projects");
  const tNav = useTranslations("Nav");
  const { stats, loading } = useStatsQuery();
  const { openCreateIssue, canCreate } = useCreate();
  const { openCreateProject } = useProjects();
  const { user } = useAuth();
  const avatarSource = useMyAvatarSource();
  const contentFade = useScrollFade<HTMLDivElement>();
  const userName = authDisplayName(
    user?.user_metadata as AuthNameMeta | undefined,
    user?.email ?? null,
    tNav("accountFallback"),
  );
  // A dedicated view event keeps visits visible even when no control is used.
  useTrackView(true, "viewed", () =>
    trackEvent("statistics_viewed", { range: "default" }),
  );

  const days = stats?.heatmap.days;
  const streak = useMemo(() => computeStreaks(days ?? []), [days]);
  const year = useMemo(() => heatmapTotals(days ?? []), [days]);
  // Day of registration, converted into the SAME time zone as bucketing of
  // events (`heatmap.tz`) — otherwise the marked box could fall one
  // next day for an account created at the end of the evening.
  const tz = stats?.heatmap.tz;
  const joinedDate = useMemo(
    () => (tz ? dayInZone(user?.created_at, tz) : null),
    [user?.created_at, tz],
  );

  const header = (
    <AppContentHeader contentClassName="gap-2 px-4 md:px-6">
      <h1 className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
        <span>{t("titlePrefix")}</span>
        <MentionChip
          type="member"
          id={user?.id ?? "current-user"}
          label={userName}
          avatarSeed={avatarSource}
          className="font-sans"
        />
      </h1>
    </AppContentHeader>
  );

  if (loading || !stats) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {header}
        <div
          ref={contentFade.ref}
          {...contentFade.scrollProps}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-5xl px-6 py-10">
            <StatsSkeleton />
          </div>
        </div>
      </div>
    );
  }

  // A new account has no story yet, so lead with the action that starts one.
  const isEmpty =
    stats.totals.created === 0 &&
    stats.totals.completed === 0 &&
    stats.totals.tasksCompleted === 0;

  if (isEmpty) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {header}
        <div
          ref={contentFade.ref}
          {...contentFade.scrollProps}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-5xl px-6 py-10">
            <EmptyScene icon={BarChart3} title={t("emptyTitle")}>
              {canCreate ? (
                <Button onClick={() => openCreateIssue()}>
                  <Plus />
                  {t("emptyCta")}
                </Button>
              ) : (
                <Button onClick={openCreateProject}>
                  <Plus />
                  {tProjects("firstProject")}
                </Button>
              )}
            </EmptyScene>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {header}
      <div
        ref={contentFade.ref}
        {...contentFade.scrollProps}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-5xl px-6 py-10">
          <StatsHero
            heatmap={stats.heatmap}
            joinedDate={joinedDate}
            total={year.total}
            issues={year.issues}
            tasks={year.tasks}
            activeDays={year.activeDays}
            streak={streak}
          />

          <WorkLandscape
            total={stats.breakdownTotal}
            projects={stats.perProject}
            categories={stats.perCategory}
            objectives={stats.perObjective}
          />

          <RhythmSection cycles={stats.cycles} workload={stats.workload} />

          <StatsSection title={t("allTime")}>
            <div className="grid grid-cols-2 gap-5 border-y border-border py-5 sm:grid-cols-4">
              <TotalItem
                label={t("created")}
                value={stats.totals.created}
                info={t("createdInfo")}
              />
              <TotalItem
                label={t("completed")}
                value={stats.totals.completed}
                info={t("completedInfo")}
              />
              <TotalItem
                label={t("tasksCompleted")}
                value={stats.totals.tasksCompleted}
                info={t("tasksCompletedInfo")}
              />
              <TotalItem
                label={t("projects")}
                value={stats.totals.projects}
                info={t("projectsInfo")}
              />
            </div>
          </StatsSection>
        </div>
      </div>
    </div>
  );
}
