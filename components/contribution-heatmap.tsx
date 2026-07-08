"use client";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { StatsHeatmap, HeatmapDay } from "@/lib/types";

// Échelle d'intensité (5 niveaux) façon GitHub, teinte "done" (emerald). Classes
// littérales complètes : Tailwind ne génère pas les noms construits dynamiquement.
const LEVEL_CLASSES = [
  "bg-muted",
  "bg-emerald-200 dark:bg-emerald-900",
  "bg-emerald-400 dark:bg-emerald-700",
  "bg-emerald-500 dark:bg-emerald-500",
  "bg-emerald-700 dark:bg-emerald-300",
] as const;

function levelOf(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 0) return 1;
  const r = count / max;
  if (r > 0.75) return 4;
  if (r > 0.5) return 3;
  if (r > 0.25) return 2;
  return 1;
}

const parseYmd = (d: string) => new Date(`${d}T00:00:00Z`);

/** Découpe la série dense (start = dimanche) en semaines de 7 jours (colonnes). */
function toWeeks(days: HeatmapDay[]): HeatmapDay[][] {
  const weeks: HeatmapDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export function ContributionHeatmap({ heatmap }: { heatmap: StatsHeatmap }) {
  const t = useTranslations("Stats");
  const tIssue = useTranslations("Issue");
  const format = useFormatter();

  const weeks = useMemo(() => toWeeks(heatmap.days), [heatmap.days]);

  // Un label de mois au-dessus de la colonne où un nouveau mois commence.
  const monthLabels = useMemo(
    () =>
      weeks.map((week, i) => {
        const first = week[0];
        if (!first) return "";
        const d = parseYmd(first.date);
        const prev = i > 0 ? parseYmd(weeks[i - 1][0].date) : null;
        if (i === 0 || (prev && d.getUTCMonth() !== prev.getUTCMonth())) {
          return format.dateTime(d, { month: "short", timeZone: "UTC" });
        }
        return "";
      }),
    [weeks, format]
  );

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex min-w-full flex-col gap-1.5">
        {/* Labels de mois */}
        <div className="grid grid-flow-col auto-cols-[12px] gap-1 pl-0.5 text-[10px] leading-none text-muted-foreground">
          {monthLabels.map((label, i) => (
            <div key={i} className="overflow-visible whitespace-nowrap">
              {label}
            </div>
          ))}
        </div>

        {/* Grille : colonnes = semaines, lignes = jours (dim → sam) */}
        <div className="grid grid-flow-col grid-rows-7 gap-1">
          {heatmap.days.map((day) => {
            const date = parseYmd(day.date);
            const label = `${day.count} ${
              day.count === 1 ? tIssue("entity") : tIssue("entityPlural")
            } · ${format.dateTime(date, {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            })}`;
            return (
              <div
                key={day.date}
                title={label}
                aria-label={label}
                className={`size-3 rounded-[3px] ${LEVEL_CLASSES[levelOf(day.count, heatmap.max)]}`}
              />
            );
          })}
        </div>

        {/* Légende */}
        <div className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
          <span>{t("less")}</span>
          {LEVEL_CLASSES.map((cls, i) => (
            <span key={i} className={`size-3 rounded-[3px] ${cls}`} />
          ))}
          <span>{t("more")}</span>
        </div>
      </div>
    </div>
  );
}
