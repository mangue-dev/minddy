"use client";

import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { StatsHeatmap } from "@/lib/types";
import { ActivityHeatmap } from "./activity-heatmap";

/** The annual activity story: one readable sentence followed by the calendar.
 *  Streaks live in the profile's figure strip (MIN-737). */
export function StatsHero({
  heatmap,
  joinedDate,
  total,
  issues,
  tasks,
  activeDays,
}: {
  heatmap: StatsHeatmap;
  joinedDate: string | null;
  total: number;
  issues: number;
  tasks: number;
  activeDays: number;
}) {
  const t = useTranslations("Stats");
  const breakdown = t("activityBreakdown", { issues, tasks, days: activeDays });

  return (
    <section aria-label={t("yearStory")}>
      <div className="mb-4 px-1">
        <p className="max-w-4xl font-display text-xl font-semibold leading-tight tracking-[-0.02em] sm:text-2xl">
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
            <TooltipContent className="whitespace-pre-line">{breakdown}</TooltipContent>
          </Tooltip>{" "}
          <span className="text-muted-foreground">
            {t("heroTotalLabel", { count: total })}
          </span>
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
        <ActivityHeatmap heatmap={heatmap} joinedDate={joinedDate} />
      </div>
    </section>
  );
}
