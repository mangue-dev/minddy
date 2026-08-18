"use client";

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "mangue-ui";
import { BarChart3, Plus } from "lucide-react";
import { useStatsQuery } from "@/lib/use-stats-query";
import { useCreate } from "@/lib/create-context";
import { useProjects } from "@/lib/projects-context";
import { useAuth } from "@/lib/auth-context";
import { computeStreaks, dayInZone, fmtNum, heatmapTotals } from "@/lib/stats-derive";
import { trackEvent } from "@/lib/analytics";
import { useTrackView } from "@/lib/use-track-view";
import { EmptyScene } from "@/components/empty-scene";
import { ActivityHeatmap } from "@/components/stats/activity-heatmap";
import { EffortDurations } from "@/components/stats/effort-durations";
import { NowBand } from "@/components/stats/now-band";
import { ProjectBreakdown } from "@/components/stats/project-breakdown";
import { StatsSkeleton } from "@/components/stats/stats-skeleton";
import {
  Metric,
  StatsCard,
  StatsSection,
  StatsSectionHeader,
  TotalItem,
} from "@/components/stats/stats-chrome";
import type { StatsCycles } from "@/lib/types";

/**
 * Page statistiques (MIN-85 — refonte de MIN-12/MIN-58).
 *
 * The page reads from top to bottom like a story, from most actionable to most
 * contemplative: what is happening now → the activity of the year → where the
 * work has gone → how fast it is coming out → totals since start. Each
 * floor has its visual weight (banner with large numbers, cards, compact strip),
 * and the title of a section always lives outside its map — which avoids
 * maps in the previous version maps.
 */

/** “Work rate” section: tickets per cycle, completion rate vs.
 * deadline, and median completion time per effort. Returned only if
 * least one of the three measurements has data. */
function RhythmSection({ cycles }: { cycles: StatsCycles }) {
  const t = useTranslations("Stats");
  const locale = useLocale();

  const showPerCycle = cycles.cycleCount > 0;
  const showCadence = cycles.completionOffsetSample > 0;
  const showEffort = cycles.byEffort.length > 0;
  if (!showPerCycle && !showCadence && !showEffort) return null;

  // Cadence: |gap| in days, with direction (advance/delay/on time).
  const offset = cycles.avgCompletionOffsetDays;
  let cadenceValue = "—";
  let cadenceHint: string | undefined;
  if (offset !== null) {
    const rounded = Math.round(Math.abs(offset) * 10) / 10;
    if (rounded < 0.05) {
      // Right on expiry: the value is sufficient, no hint.
      cadenceValue = t("cadenceOnTimeValue");
    } else {
      cadenceValue = t("cadenceDays", { value: fmtNum(rounded, locale) });
      cadenceHint = offset < 0 ? t("cadenceEarly") : t("cadenceLate");
    }
  }

  return (
    <StatsSection title={t("rhythm")}>
      <div className="flex flex-col gap-4">
        {(showPerCycle || showCadence) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {showPerCycle && (
              <StatsCard>
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
              </StatsCard>
            )}
            {showCadence && (
              <StatsCard>
                <Metric
                  label={t("cadence")}
                  value={cadenceValue}
                  hint={cadenceHint}
                  info={t("cadenceInfo")}
                />
              </StatsCard>
            )}
          </div>
        )}

        {showEffort && (
          <StatsCard className="flex flex-col gap-4">
            <StatsSectionHeader
              title={t("effortDuration")}
              info={t("effortDurationInfo")}
            />
            <EffortDurations byEffort={cycles.byEffort} />
          </StatsCard>
        )}
      </div>
    </StatsSection>
  );
}

export default function StatisticsPage() {
  const t = useTranslations("Stats");
  const tProjects = useTranslations("Projects");
  const { stats, loading } = useStatsQuery();
  const { openCreateIssue, canCreate } = useCreate();
  const { openCreateProject } = useProjects();
  const { user } = useAuth();
  // Stats page view — one of the few “viewed” pages rather
  // only “used”: without a dedicated event, its real use is invisible.
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
    <div className="mb-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
    </div>
  );

  if (loading || !stats) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        {header}
        <StatsSkeleton />
      </div>
    );
  }

  // Account nine: nothing created, nothing completed, nothing checked. None of the
  // sections then has nothing to say — we invite you to start.
  const isEmpty =
    stats.totals.created === 0 &&
    stats.totals.completed === 0 &&
    stats.totals.tasksCompleted === 0;

  if (isEmpty) {
    return (
      /* Neither title nor subtitle here: a page of measurements which has not measured anything has
         not to announce yourself. There remains the gesture which will start the counter, and it depends
         where is the account - as on the global board: without a project, there is no
         there is no ticket to create, there is a project to create (`canCreate`
         is exactly this signal). */
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
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      {header}

      {/* 1 — The present: what remains on the pile, the momentum, the series. */}
      <NowBand workload={stats.workload} week={stats.week} streak={streak} />

      {/* 2 — The past year, with its leading number before the grid. */}
      <StatsSection title={t("activity")} info={t("contributionsInfo")}>
        <StatsCard className="flex flex-col gap-5">
          <Metric
            label={t("activityWindow")}
            value={year.total}
            hint={t("activityBreakdown", {
              issues: year.issues,
              tasks: year.tasks,
              days: year.activeDays,
            })}
          />
          <ActivityHeatmap heatmap={stats.heatmap} joinedDate={joinedDate} />
        </StatsCard>
      </StatsSection>

      {/* 3 — Where this work landed. */}
      <StatsSection
        title={t("perProject")}
        info={t("perProjectInfo")}
      >
        <ProjectBreakdown
          buckets={stats.perProject}
          emptyLabel={t("perProjectEmpty")}
        />
      </StatsSection>

      {/* 4 — At what rate it comes out (cycles, cadence, durations per effort). */}
      <RhythmSection cycles={stats.cycles} />

      {/* 5 — Lifetime totals, in small form: the base, not the news. */}
      <StatsSection title={t("allTime")}>
        <StatsCard className="grid grid-cols-2 gap-5 sm:grid-cols-4">
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
        </StatsCard>
      </StatsSection>
    </div>
  );
}
