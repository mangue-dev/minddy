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
 * La page se lit de haut en bas comme un récit, du plus actionnable au plus
 * contemplatif : ce qui se passe maintenant → l'activité de l'année → où le
 * travail est allé → à quel rythme il sort → les totaux depuis le début. Chaque
 * étage a son poids visuel (bandeau à gros chiffres, cartes, bande compacte),
 * et le titre d'une section vit toujours hors de sa carte — ce qui évite les
 * cartes dans les cartes de la version précédente.
 */

/** Section « Rythme de travail » : tickets par cycle, cadence de complétion vs
 *  échéance, et durée moyenne de complétion par effort. Rendue seulement si au
 *  moins une des trois mesures a de la donnée. */
function RhythmSection({ cycles }: { cycles: StatsCycles }) {
  const t = useTranslations("Stats");
  const locale = useLocale();

  const showPerCycle = cycles.cycleCount > 0;
  const showCadence = cycles.completionOffsetSample > 0;
  const showEffort = cycles.byEffort.length > 0;
  if (!showPerCycle && !showCadence && !showEffort) return null;

  // Cadence : |écart| en jours, avec le sens (avance / retard / à l'heure).
  const offset = cycles.avgCompletionOffsetDays;
  let cadenceValue = "—";
  let cadenceHint: string | undefined;
  if (offset !== null) {
    const rounded = Math.round(Math.abs(offset) * 10) / 10;
    if (rounded < 0.05) {
      // Pile à l'échéance : la valeur se suffit, pas de hint.
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
  // Vue de la page stats — l'une des rares pages « consultées » plutôt
  // qu'« utilisées » : sans événement dédié, son usage réel est invisible.
  useTrackView(true, "viewed", () =>
    trackEvent("statistics_viewed", { range: "default" }),
  );

  const days = stats?.heatmap.days;
  const streak = useMemo(() => computeStreaks(days ?? []), [days]);
  const year = useMemo(() => heatmapTotals(days ?? []), [days]);
  // Jour d'inscription, converti dans le MÊME fuseau que le bucketing des
  // événements (`heatmap.tz`) — sans quoi la case marquée pourrait tomber un
  // jour à côté pour un compte créé en fin de soirée.
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

  // Compte neuf : rien de créé, rien de terminé, rien de coché. Aucune des
  // sections n'a alors quoi que ce soit à raconter — on invite à démarrer.
  const isEmpty =
    stats.totals.created === 0 &&
    stats.totals.completed === 0 &&
    stats.totals.tasksCompleted === 0;

  if (isEmpty) {
    return (
      /* Ni titre ni sous-titre ici : une page de mesures qui n'a rien mesuré n'a
         pas à s'annoncer. Reste le geste qui lancera le compteur, et il dépend
         d'où en est le compte — comme sur le board global : sans projet, il n'y
         a pas de ticket à créer, il y a un projet à faire naître (`canCreate`
         est exactement ce signal). */
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

      {/* 1 — Le présent : ce qu'il reste sur la pile, l'élan, la série. */}
      <NowBand workload={stats.workload} week={stats.week} streak={streak} />

      {/* 2 — L'année écoulée, avec son chiffre de tête avant la grille. */}
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

      {/* 3 — Où ce travail a atterri. */}
      <StatsSection
        title={t("perProject")}
        info={t("perProjectInfo")}
      >
        <ProjectBreakdown
          buckets={stats.perProject}
          emptyLabel={t("perProjectEmpty")}
        />
      </StatsSection>

      {/* 4 — À quel rythme il sort (cycles, cadence, durées par effort). */}
      <RhythmSection cycles={stats.cycles} />

      {/* 5 — Les totaux à vie, en petit : le socle, pas l'actualité. */}
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
