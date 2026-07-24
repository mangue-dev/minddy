"use client";

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Skeleton, Tooltip, TooltipTrigger, TooltipContent } from "mangue-ui";
import {
  FilePlus2,
  CheckCircle2,
  FolderKanban,
  CircleDot,
  Flame,
  Layers,
  CalendarClock,
  CalendarRange,
  ListChecks,
  Timer,
  Info,
  type LucideIcon,
} from "lucide-react";
import { useStatsQuery } from "@/lib/use-stats-query";
import { ContributionHeatmap } from "@/components/contribution-heatmap";
import { EFFORT_MAP } from "@/lib/issue-constants";
import type { HeatmapDay, StatProjectBucket, StatsCycles } from "@/lib/types";

/** Nombre → chaîne localisée (virgule FR, point EN), 1 décimale par défaut. */
function fmtNum(value: number, locale: string, digits = 1): string {
  return value.toLocaleString(locale, { maximumFractionDigits: digits });
}

/** Durée de complétion lisible : minutes < 90 min, heures < 48 h, sinon jours.
 *  Renvoie la clé de message d'unité + la valeur déjà arrondie. */
function durationParts(seconds: number): {
  key: "durationMinutes" | "durationHours" | "durationDays";
  value: number;
} {
  const minutes = seconds / 60;
  if (minutes < 90) return { key: "durationMinutes", value: Math.round(minutes) };
  const hours = seconds / 3600;
  if (hours < 48) return { key: "durationHours", value: Math.round(hours * 10) / 10 };
  return { key: "durationDays", value: Math.round((seconds / 86400) * 10) / 10 };
}

/** Streak courant (jours consécutifs finissant à aujourd'hui, avec grâce si le
 *  jour courant est encore vide) + record sur la fenêtre. */
function computeStreaks(days: HeatmapDay[]): { current: number; longest: number } {
  let longest = 0;
  let run = 0;
  for (const d of days) {
    if (d.count > 0) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) current++;
    else if (i === days.length - 1) continue; // aujourd'hui vide : pas de rupture
    else break;
  }
  return { current, longest };
}

/** Petit « i » avec une infobulle expliquant ce que compte une métrique. */
function InfoHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={text}
          className="inline-flex text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[240px] text-xs leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
  hint,
  info,
}: {
  icon: LucideIcon;
  value: number | string;
  label: string;
  hint?: string;
  info?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-4 shrink-0" />
        <span className="text-sm font-medium">{label}</span>
        {info ? (
          <span className="ml-auto">
            <InfoHint text={info} />
          </span>
        ) : null}
      </div>
      <div className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function ProjectBar({
  bucket,
  max,
  deletedLabel,
}: {
  bucket: StatProjectBucket;
  max: number;
  deletedLabel: string;
}) {
  const pct = max > 0 ? Math.round((bucket.completed / max) * 100) : 0;
  const fill = bucket.deleted
    ? "var(--muted-foreground)"
    : bucket.color ?? "var(--primary)";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span
          className={`truncate ${bucket.deleted ? "text-muted-foreground line-through" : "text-foreground/90"}`}
        >
          {bucket.name || "—"}
          {bucket.deleted ? (
            <span className="ml-1.5 text-xs no-underline">({deletedLabel})</span>
          ) : null}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {bucket.completed}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(pct, bucket.completed > 0 ? 4 : 0)}%`, backgroundColor: fill }}
        />
      </div>
    </div>
  );
}

/** Section « Cycles » (MIN-58) : tickets moyens par cycle, cadence de
 *  complétion vs échéance, et durée moyenne de complétion par effort. Masquée
 *  tant qu'aucune de ces trois métriques n'a de donnée. */
function CyclesSection({ cycles }: { cycles: StatsCycles }) {
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
      cadenceValue = t("cadenceOnTimeValue");
      cadenceHint = t("cadenceOnTime");
    } else {
      cadenceValue = t("cadenceDays", { value: fmtNum(rounded, locale) });
      cadenceHint = offset < 0 ? t("cadenceEarly") : t("cadenceLate");
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 text-card-foreground">
      <div className="mb-4 flex items-center gap-1.5">
        <h2 className="text-sm font-semibold tracking-tight">{t("cycles")}</h2>
        <InfoHint text={t("cyclesInfo")} />
      </div>

      {(showPerCycle || showCadence) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {showPerCycle && (
            <StatCard
              icon={Layers}
              value={
                cycles.avgIssuesPerCycle !== null
                  ? fmtNum(cycles.avgIssuesPerCycle, locale)
                  : "—"
              }
              label={t("cycleTickets")}
              hint={t("cycleCount", { count: cycles.cycleCount })}
              info={t("cycleTicketsInfo")}
            />
          )}
          {showCadence && (
            <StatCard
              icon={CalendarClock}
              value={cadenceValue}
              label={t("cadence")}
              hint={cadenceHint}
              info={t("cadenceInfo")}
            />
          )}
        </div>
      )}

      {showEffort && (
        <div className={showPerCycle || showCadence ? "mt-5" : undefined}>
          <div className="mb-3 flex items-center gap-1.5 text-muted-foreground">
            <Timer className="size-4 shrink-0" />
            <h3 className="text-sm font-medium text-foreground">
              {t("effortDuration")}
            </h3>
            <InfoHint text={t("effortDurationInfo")} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cycles.byEffort.map((e) => {
              const parts = durationParts(e.avgSeconds);
              return (
                <div
                  key={e.effort}
                  className="rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
                      {EFFORT_MAP[e.effort].label}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {t("effortSample", { count: e.sample })}
                    </span>
                  </div>
                  <div className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight text-foreground">
                    {t(parts.key, { value: fmtNum(parts.value, locale) })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export default function StatisticsPage() {
  const t = useTranslations("Stats");
  const { stats, loading } = useStatsQuery();

  const streaks = useMemo(
    () => computeStreaks(stats?.heatmap.days ?? []),
    [stats?.heatmap.days]
  );
  const maxCompleted = useMemo(
    () => (stats?.perProject ?? []).reduce((m, p) => Math.max(m, p.completed), 0),
    [stats?.perProject]
  );

  if (loading || !stats) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-6 h-[180px] rounded-xl" />
      </div>
    );
  }

  const isEmpty =
    stats.totals.created === 0 &&
    stats.totals.completed === 0 &&
    stats.totals.tasksCompleted === 0;

  // Tendance de la semaine : le signe porte le sens, pas de couleur d'alerte —
  // une semaine calme n'est pas une erreur.
  const weekDelta = stats.week.completed - stats.week.previous;
  const weekTrend =
    weekDelta === 0
      ? t("weekTrendFlat")
      : weekDelta > 0
        ? t("weekTrendUp", { value: weekDelta })
        : t("weekTrendDown", { value: -weekDelta });

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">
        {t("title")}
      </h1>

      {/* Cartes de synthèse : ce qui s'est accumulé, puis le moment présent. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={FilePlus2}
          value={stats.totals.created}
          label={t("created")}
          info={t("createdInfo")}
        />
        <StatCard
          icon={CheckCircle2}
          value={stats.totals.completed}
          label={t("completed")}
          info={t("completedInfo")}
        />
        <StatCard
          icon={ListChecks}
          value={stats.totals.tasksCompleted}
          label={t("tasksCompleted")}
          info={t("tasksCompletedInfo")}
        />
        <StatCard
          icon={CalendarRange}
          value={stats.week.completed}
          label={t("week")}
          hint={weekTrend}
          info={t("weekInfo")}
        />
        <StatCard
          icon={CircleDot}
          value={stats.workload.assignedOpen}
          label={t("workload")}
          hint={t("workloadInProgress", { count: stats.workload.inProgress })}
          info={t("workloadInfo")}
        />
        <StatCard
          icon={Flame}
          value={t("streakDays", { count: streaks.current })}
          label={t("streak")}
          hint={t("streakRecord", { count: streaks.longest })}
          info={t("streakInfo")}
        />
        <StatCard
          icon={FolderKanban}
          value={stats.totals.projects}
          label={t("projects")}
          info={t("projectsInfo")}
        />
      </div>

      {/* Statistiques de cycle (MIN-58) */}
      <CyclesSection cycles={stats.cycles} />

      {/* Heatmap de contributions */}
      <section className="mt-8 rounded-xl border border-border bg-card p-5 text-card-foreground">
        <div className="mb-4">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold tracking-tight">{t("contributions")}</h2>
            <InfoHint text={t("contributionsInfo")} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("contributionsSubtitle")}
          </p>
        </div>
        <ContributionHeatmap heatmap={stats.heatmap} />
      </section>

      {/* Répartition par projet */}
      <section className="mt-6 rounded-xl border border-border bg-card p-5 text-card-foreground">
        <div className="mb-4 flex items-center gap-1.5">
          <h2 className="text-sm font-semibold tracking-tight">{t("perProject")}</h2>
          <InfoHint text={t("perProjectInfo")} />
        </div>
        {stats.perProject.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isEmpty ? t("empty") : t("perProjectEmpty")}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {stats.perProject.map((bucket, i) => (
              <ProjectBar
                key={`${bucket.name ?? "?"}-${i}`}
                bucket={bucket}
                max={maxCompleted}
                deletedLabel={t("deleted")}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
