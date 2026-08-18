"use client";

import { useLocale, useTranslations } from "next-intl";
import { EFFORT_MAP } from "@/lib/issue-constants";
import { durationParts, fmtNum } from "@/lib/stats-derive";
import type { StatsCycleEffort } from "@/lib/types";

/**
 * Median completion time per effort (MIN-85).
 *
 * Formerly five juxtaposed boxes, each with its own scale
 * implied: we couldn't see that an L takes six times more than an S. Here,
 * a bar per effort on a scale common (the longest = 100%), so the
 * comparison is immediate — that's the whole point of the measurement.
 *
 * These durations are medians, not averages: on a sample of ten
 * tickets, a single one started before a vacation is enough to make the average say
 * that an M takes three weeks. A bar that no longer describes the current case no longer compares to anything.
 */
export function EffortDurations({ byEffort }: { byEffort: StatsCycleEffort[] }) {
  const t = useTranslations("Stats");
  const locale = useLocale();

  const max = byEffort.reduce((m, e) => Math.max(m, e.medianSeconds), 0);

  return (
    <div className="flex flex-col gap-3">
      {byEffort.map((e) => {
        const parts = durationParts(e.medianSeconds);
        const width = max > 0 ? (e.medianSeconds / max) * 100 : 0;
        return (
          <div key={e.effort} className="flex items-center gap-3">
            <span className="w-7 shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-center text-xs font-semibold text-muted-foreground">
              {EFFORT_MAP[e.effort].label}
            </span>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              {/* Neutral tint derived from text: These bars measure TIME, not completion — giving them the brand accent or the green "done" would make them say something else. */}
              <div
                className="h-full rounded-full bg-foreground/30 transition-all"
                style={{ width: `${Math.max(width, 3)}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
              {t(parts.key, { value: fmtNum(parts.value, locale) })}
            </span>
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {t("effortSample", { count: e.sample })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
