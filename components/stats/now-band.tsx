"use client";

import { useTranslations } from "next-intl";
import type { StatsWeek, StatsWorkload } from "@/lib/types";
import { Delta, Metric, StatsCard } from "./stats-chrome";

/**
 * Bandeau « en ce moment » (MIN-85) — le présent, en tête de page : ce qu'il
 * reste sur la pile, l'élan des 7 derniers jours, et la série en cours.
 *
 * Une seule carte à 3 colonnes séparées par des filets, plutôt que 3 cartes :
 * ces trois chiffres se lisent ensemble (« où j'en suis là, maintenant »), et
 * un bloc unique donne à la section le poids visuel qu'elle mérite en haut de
 * page. Sous `sm`, les colonnes s'empilent et les filets passent à l'horizontale.
 */
export function NowBand({
  workload,
  week,
  streak,
}: {
  workload: StatsWorkload;
  week: StatsWeek;
  streak: { current: number; longest: number };
}) {
  const t = useTranslations("Stats");

  const delta = week.completed - week.previous;
  const deltaLabel =
    delta === 0
      ? t("weekTrendFlat")
      : delta > 0
        ? t("weekTrendUp", { value: delta })
        : t("weekTrendDown", { value: -delta });

  return (
    <StatsCard className="grid grid-cols-1 gap-5 divide-y divide-border sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-y-0">
      <Metric
        variant="hero"
        className="sm:pr-5"
        label={t("workload")}
        value={workload.assignedOpen}
        hint={t("workloadInProgress", { count: workload.inProgress })}
        info={t("workloadInfo")}
      />
      <Metric
        variant="hero"
        className="pt-5 sm:px-5 sm:pt-0"
        label={t("week")}
        value={week.completed}
        hint={<Delta value={delta} label={deltaLabel} />}
        info={t("weekInfo")}
      />
      <Metric
        variant="hero"
        className="pt-5 sm:pl-5 sm:pt-0"
        label={t("streak")}
        value={t("streakDays", { count: streak.current })}
        hint={t("streakRecord", { count: streak.longest })}
        info={t("streakInfo")}
      />
    </StatsCard>
  );
}
