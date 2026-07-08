"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Skeleton, Tooltip, TooltipTrigger, TooltipContent } from "mangue-ui";
import {
  FilePlus2,
  CheckCircle2,
  FolderKanban,
  CircleDot,
  Flame,
  Info,
  type LucideIcon,
} from "lucide-react";
import { useStatsQuery } from "@/lib/use-stats-query";
import { ContributionHeatmap } from "@/components/contribution-heatmap";
import type { HeatmapDay, StatProjectBucket } from "@/lib/types";

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
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-6 h-[180px] rounded-xl" />
      </div>
    );
  }

  const isEmpty = stats.totals.created === 0 && stats.totals.completed === 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">
        {t("title")}
      </h1>

      {/* Cartes de synthèse */}
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
          icon={FolderKanban}
          value={stats.totals.projects}
          label={t("projects")}
          info={t("projectsInfo")}
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
      </div>

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
