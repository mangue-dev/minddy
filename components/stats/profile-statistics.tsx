"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStatsQuery } from "@/lib/use-stats-query";
import { useCreate } from "@/lib/create-context";
import { useProjects } from "@/lib/projects-context";
import { useAuth } from "@/lib/auth-context";
import {
  computeStreaks,
  dayInZone,
  fmtNum,
  heatmapTotals,
} from "@/lib/stats-derive";
import { trackEvent } from "@/lib/analytics";
import { useTrackView } from "@/lib/use-track-view";
import { EmptyScene } from "@/components/empty-scene";
import { EffortDurations } from "@/components/stats/effort-durations";
import { StatsHero } from "@/components/stats/stats-hero";
import { StatsSkeleton } from "@/components/stats/stats-skeleton";
import { WorkLandscape } from "@/components/stats/work-landscape";
import {
  Metric,
  StatsCard,
  StatsFigure,
  StatsFigureStrip,
  StatsSection,
} from "@/components/stats/stats-chrome";
import type { StatsCycles } from "@/lib/types";
import { STATISTICS_ICON } from "@/components/feature-icons";

/**
 * Personal statistics inside the profile (MIN-737, formerly the /statistics
 * page of MIN-433): a strip of lifetime figures under the identity, then the
 * annual activity, where the work landed and the quieter rhythm details.
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

export function ProfileStatistics() {
  const t = useTranslations("Stats");
  const tProjects = useTranslations("Projects");
  const { stats, loading } = useStatsQuery();
  const { openCreateIssue, canCreate } = useCreate();
  const { openCreateProject } = useProjects();
  const { user } = useAuth();
  // A dedicated view event keeps visits visible even when no control is used;
  // the name predates the move into the profile and keeps its history.
  useTrackView(true, "viewed", () =>
    trackEvent("statistics_viewed", { range: "default" }),
  );

  const days = stats?.heatmap.days;
  const streak = useMemo(() => computeStreaks(days ?? []), [days]);
  const completedInYear = stats?.heatmap.completed;
  const year = useMemo(
    () => heatmapTotals(days ?? [], completedInYear),
    [days, completedInYear],
  );
  // Day of registration, converted into the SAME time zone as the bucketing
  // of events (`heatmap.tz`) — otherwise the marked day could fall on the
  // next one for an account created late in the evening.
  const tz = stats?.heatmap.tz;
  const joinedDate = useMemo(
    () => (tz ? dayInZone(user?.created_at, tz) : null),
    [user?.created_at, tz],
  );

  if (loading || !stats) return <StatsSkeleton />;

  // A new account has no story yet, so lead with the action that starts one.
  const isEmpty =
    stats.totals.created === 0 &&
    stats.totals.completed === 0 &&
    stats.totals.tasksCompleted === 0;

  if (isEmpty) {
    return (
      <EmptyScene icon={STATISTICS_ICON} title={t("emptyTitle")}>
        {canCreate ? (
          <Button onClick={() => openCreateIssue()}>
            <HugeiconsIcon icon={Add01Icon} />
            {t("emptyCta")}
          </Button>
        ) : (
          <Button onClick={openCreateProject}>
            <HugeiconsIcon icon={Add01Icon} />
            {tProjects("firstProject")}
          </Button>
        )}
      </EmptyScene>
    );
  }

  return (
    <div>
      <StatsFigureStrip columns={6}>
        <StatsFigure
          label={t("completed")}
          value={stats.totals.completed}
          info={t("completedInfo")}
        />
        <StatsFigure
          label={t("tasksCompleted")}
          value={stats.totals.tasksCompleted}
          info={t("tasksCompletedInfo")}
        />
        <StatsFigure
          label={t("created")}
          value={stats.totals.created}
          info={t("createdInfo")}
        />
        <StatsFigure
          label={t("projects")}
          value={stats.totals.projects}
          info={t("projectsInfo")}
        />
        <StatsFigure
          label={t("longestStreak")}
          value={t("streakDays", { count: streak.longest })}
        />
        <StatsFigure
          label={t("currentStreak")}
          value={t("streakDays", { count: streak.current })}
        />
      </StatsFigureStrip>

      <div className="mt-8">
        <StatsHero
          heatmap={stats.heatmap}
          joinedDate={joinedDate}
          total={year.total}
          issues={year.issues}
          tasks={year.tasks}
          activeDays={year.activeDays}
        />
      </div>

      <WorkLandscape
        total={stats.breakdownTotal}
        projects={stats.perProject}
        categories={stats.perCategory}
        objectives={stats.perObjective}
      />

      <RhythmSection cycles={stats.cycles} workload={stats.workload} />
    </div>
  );
}
