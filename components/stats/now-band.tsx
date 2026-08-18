"use client";

import { useTranslations } from "next-intl";
import type { StatsWeek, StatsWorkload } from "@/lib/types";
import { Delta, Metric, StatsCard } from "./stats-chrome";

/**
 * “Right now” banner (MIN-85) — the present, at the top of the page: what
 * remains on the pile, the momentum of the last 7 days, and the current series.
 *
 * A single card with 3 columns separated by lines, rather than 3 cards :
 * these three numbers read together ("where I am now"), and
 * a single block gives the section the visual weight it deserves at the top of
 * page. Under `sm`, the columns stack and the nets become horizontal.
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
