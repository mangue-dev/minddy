"use client";

import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { StatsHeatmap } from "@/lib/types";
import { ActivityHeatmap } from "./activity-heatmap";

/** The annual activity story: one readable sentence followed by the calendar. */
export function StatsHero({
  heatmap,
  joinedDate,
  total,
  issues,
  tasks,
  activeDays,
  streak,
}: {
  heatmap: StatsHeatmap;
  joinedDate: string | null;
  total: number;
  issues: number;
  tasks: number;
  activeDays: number;
  streak: { current: number; longest: number };
}) {
  const t = useTranslations("Stats");
  const breakdown = t("activityBreakdown", { issues, tasks, days: activeDays });

  return (
    <section aria-label={t("yearStory")}>
      <div className="mb-5 px-1">
        <p className="max-w-4xl font-display text-3xl font-semibold leading-tight tracking-[-0.025em] sm:text-4xl">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`${total}. ${breakdown}`}
                className="rounded-sm text-foreground underline decoration-border decoration-dotted underline-offset-[6px] outline-none transition-colors hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {total}
              </button>
            </TooltipTrigger>
            <TooltipContent>{breakdown}</TooltipContent>
          </Tooltip>{" "}
          <span className="text-muted-foreground">
            {t("heroTotalLabel", { count: total })}
          </span>
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("streakStory", { count: streak.current })}
          <span aria-hidden> · </span>
          {t("streakRecord", { count: streak.longest })}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
        <ActivityHeatmap heatmap={heatmap} joinedDate={joinedDate} />
      </div>
    </section>
  );
}
