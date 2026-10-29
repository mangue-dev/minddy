"use client";

import type { ReactNode } from "react";
import { useFormatter } from "next-intl";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { StackedSeries } from "@/lib/admin-costs";

/**
 * Charts of the admin Costs tab (MIN-829), drawn with plain elements like the
 * rest of the app's statistics: no chart library, theme tokens for the axes,
 * fixed Tailwind tints for the series so a color names the same thing in
 * light and dark mode. Identity never rests on color alone: every chart has a
 * legend and its tooltip names each value.
 */

/** A trend line without axes, for a summary card. */
export function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  const max = Math.max(...values, 0);
  if (values.length < 2 || max === 0) {
    return <div className={cn("h-10 w-28 border-b border-dashed border-border", className)} aria-hidden />;
  }
  const width = 112;
  const height = 40;
  const step = width / (values.length - 1);
  const points = values
    .map((value, index) => `${(index * step).toFixed(1)},${(height - 2 - (value / max) * (height - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("h-10 w-28 overflow-visible", className)} aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export interface SeriesStyle {
  label: ReactNode;
  /** Background class of the bar segment and the legend patch. */
  color: string;
}

function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.5, 2, 3, 4, 5, 7.5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

/**
 * One stacked column per day. The hover target is the whole column, and its
 * tooltip lists every series of that day with the total.
 */
export function StackedBarChart({
  series,
  styles,
  format,
  dayLabel,
  totalLabel,
  emptyLabel,
  height = "h-44",
}: {
  series: StackedSeries;
  styles: (key: string) => SeriesStyle;
  format: (value: number) => string;
  dayLabel: (day: string) => string;
  totalLabel: string;
  emptyLabel: string;
  height?: string;
}) {
  const totals = series.days.map((day) => Object.values(day.values).reduce((sum, value) => sum + value, 0));
  const ceiling = niceCeiling(Math.max(...totals, 0));
  if (series.keys.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const ticks = [ceiling, ceiling / 2, 0];
  const labelEvery = Math.max(1, Math.ceil(series.days.length / 6));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className={cn("flex shrink-0 flex-col justify-between pb-0 text-right text-[11px] tabular-nums text-muted-foreground", height)}>
          {ticks.map((tick) => (
            <span key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{format(tick)}</span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("relative flex items-end gap-[3px] border-b border-border", height)}>
            <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border/70" aria-hidden />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border/70" aria-hidden />
            {series.days.map((day, index) => (
              <Tooltip key={day.day}>
                <TooltipTrigger asChild>
                  <div className="relative flex h-full min-w-[3px] flex-1 flex-col-reverse rounded-sm hover:bg-muted/60">
                    {series.keys.map((key) => {
                      const value = day.values[key] ?? 0;
                      if (value <= 0) return null;
                      return (
                        <div
                          key={key}
                          className={cn("w-full first:rounded-b-[2px] last:rounded-t-[3px]", styles(key).color)}
                          style={{ height: `${Math.max((value / ceiling) * 100, 1.5)}%` }}
                        />
                      );
                    })}
                    <span className="sr-only">{`${dayLabel(day.day)}: ${format(totals[index])}`}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="min-w-44">
                  <span className="font-medium">{dayLabel(day.day)}</span>
                  {series.keys
                    .filter((key) => (day.values[key] ?? 0) > 0)
                    .map((key) => (
                      <span key={key} className="mt-1 flex items-center justify-between gap-4 text-background/80">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className={cn("size-2 shrink-0 rounded-[2px]", styles(key).color)} aria-hidden />
                          <span className="truncate">{styles(key).label}</span>
                        </span>
                        <span className="tabular-nums">{format(day.values[key])}</span>
                      </span>
                    ))}
                  <span className="mt-1.5 flex justify-between gap-4 border-t border-background/20 pt-1.5 font-medium">
                    <span>{totalLabel}</span>
                    <span className="tabular-nums">{format(totals[index])}</span>
                  </span>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          <div className="mt-1.5 flex gap-[3px] text-[11px] tabular-nums text-muted-foreground">
            {series.days.map((day, index) => (
              <span key={day.day} className="min-w-[3px] flex-1 overflow-visible whitespace-nowrap">
                {index % labelEvery === 0 ? dayLabel(day.day) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <ChartLegend keys={series.keys} styles={styles} />
    </div>
  );
}

export function ChartLegend({ keys, styles }: { keys: string[]; styles: (key: string) => SeriesStyle }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3 text-xs">
      {keys.map((key) => (
        <span key={key} className="flex min-w-0 items-center gap-1.5">
          <span className={cn("size-2.5 shrink-0 rounded-full", styles(key).color)} aria-hidden />
          <span className="truncate text-foreground/80">{styles(key).label}</span>
        </span>
      ))}
    </div>
  );
}

/** “↓ 12.5%” in the colors of a cost: up is the warning. */
export function ChangeBadge({ change, label }: { change: number | null; label: string }) {
  const format = useFormatter();
  if (change === null) return <span className="text-xs text-muted-foreground">{label}</span>;
  const up = change > 0;
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className={cn("font-medium tabular-nums", up ? "text-orange-600 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400")}>
        {up ? "↑" : "↓"} {format.number(Math.abs(change), { style: "percent", maximumFractionDigits: 1 })}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
