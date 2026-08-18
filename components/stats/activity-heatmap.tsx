"use client";

import { useCallback, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { StatsHeatmap, HeatmapDay } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Intensity scale (5 levels) GitHub style, “done” shade (emerald — the
// color of the Completed status everywhere in the app). Complete literal classes:
// Tailwind does not generate dynamically constructed names.
//
// Level 0 (day with nothing) can NOT be `bg-muted`: in dark theme,
// --muted (L 0.200) is darker than --card (L 0.214), so empty boxes
// disappear in the map and the grid loses its shape. A shade derived from
// text, it contrasts in the two themes.
const LEVEL_CLASSES = [
  "bg-foreground/[0.07] dark:bg-foreground/[0.13]",
  "bg-emerald-200 dark:bg-emerald-900",
  "bg-emerald-400 dark:bg-emerald-700",
  "bg-emerald-500 dark:bg-emerald-500",
  "bg-emerald-700 dark:bg-emerald-300",
] as const;

// The registration day is a LANDMARK, not an intensity: its guardrail
// orange even if tickets were completed that day (this is the only
// fixed point of the grid, we don't want it to drown in the green scale).
const JOINED_CLASS = "bg-orange-500 dark:bg-orange-400";

// Grid geometry: a 12px box + 4px gutter = one step
// 16px, shared by the boxes, month labels and days column —
// this is what ensures that “March” falls well above its week.
const CELL = "size-3 rounded-[3px]";

/** Rows with a day label (the grid starts on a Sunday). */
const LABELLED_ROWS = new Set([1, 3, 5]); // lundi, mercredi, vendredi

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

/** Cuts the dense series (start = Sunday) into weeks of 7 days (columns). */
function toWeeks(days: HeatmapDay[]): HeatmapDay[][] {
  const weeks: HeatmapDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/** A detail line: pastille of the same family as the boxes, value en
 * before, unit indented — we read the number before reading what it counts. */
function DetailRow({ swatch, value, unit }: { swatch: string; value: number; unit: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`size-2 shrink-0 rounded-[2px] ${swatch}`} />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-background/65">{unit}</span>
    </div>
  );
}

/** Content of the tooltip for a day: the date at the top, then the details of what
 * was completed — tasks only appear if there are any. The day
 * of registration also has its dedicated line, which explains its orange box. */
function DayDetail({ day, joined }: { day: HeatmapDay; joined: boolean }) {
  const t = useTranslations("Stats");
  const format = useFormatter();

  return (
    <div className="flex flex-col gap-1.5 text-left">
      {/* `first-letter` and not `capitalize`: in French, days and months are lowercase
 — “Thursday August 28”, not “Thursday August 28”. Only the initial
 of the line is capitalized (without effect in English, already capitalized). */}
      <div className="font-medium first-letter:uppercase">
        {format.dateTime(parseYmd(day.date), {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "UTC",
        })}
      </div>
      <div className="flex flex-col gap-1">
        {joined ? (
          <div className="flex items-center gap-1.5">
            <span className={`size-2 shrink-0 rounded-[2px] ${JOINED_CLASS}`} />
            <span>{t("dayJoined")}</span>
          </div>
        ) : null}
        {day.issues > 0 ? (
          <DetailRow
            swatch="bg-emerald-400"
            value={day.issues}
            unit={t("dayIssuesUnit", { count: day.issues })}
          />
        ) : null}
        {day.tasks > 0 ? (
          <DetailRow
            swatch="bg-background/45"
            value={day.tasks}
            unit={t("dayTasksUnit", { count: day.tasks })}
          />
        ) : null}
        {/* “Nothing finished” only makes sense if the box has nothing else to say — the day of registration already has its mark. */}
        {day.count === 0 && !joined ? (
          <div className="text-background/65">{t("dayNone")}</div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 53-week contribution grid (MIN-85).
 *
 * Columns = weeks, rows = days (Sunday → Saturday). Compared to the
 * previous version: a gutter of day labels on the left, and a real
 * structured tooltip instead of the native `title` attribute (slow to open,
 * not styleable, and which flattened everything into a sentence).
 *
 * Only ONE tooltip for the 371 boxes, and not one per box: an invisible anchor
 * moves to the hovered box (via event delegation), this
 * which avoids mounting 371 Radix roots. Each box keeps its `aria-label` —
 * the tooltip is a visual comfort, not the only one carrying the information.
 */
export function ActivityHeatmap({
  heatmap,
  joinedDate,
}: {
  heatmap: StatsHeatmap;
  /** Registration day (YYYY-MM-DD, in `heatmap.tz`), or null if it is
 * unknown or before the window — the corresponding box is marked. */
  joinedDate?: string | null;
}) {
  const t = useTranslations("Stats");
  const format = useFormatter();

  const [hovered, setHovered] = useState<{
    day: HeatmapDay;
    left: number;
    top: number;
  } | null>(null);

  const weeks = useMemo(() => toWeeks(heatmap.days), [heatmap.days]);

  // A month label above the column where a new month begins.
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
    [weeks, format],
  );

  // Localized day names, read on the first real week: `start` is
  // guaranteed Sunday, so row index = day of the week.
  const weekdayLabels = useMemo(() => {
    const first = weeks[0];
    if (!first) return [] as string[];
    return Array.from({ length: 7 }, (_, row) => {
      if (!LABELLED_ROWS.has(row) || !first[row]) return "";
      return format.dateTime(parseYmd(first[row].date), {
        weekday: "short",
        timeZone: "UTC",
      });
    });
  }, [weeks, format]);

  // `offsetLeft/offsetTop` are relative to the (positioned) grid, so
  // the anchor is placed without costly measures and follows the horizontal scrolling.
  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-day-index]",
      );
      if (!cell) return;
      const day = heatmap.days[Number(cell.dataset.dayIndex)];
      if (!day) return;
      setHovered((prev) =>
        prev?.day.date === day.date
          ? prev
          : { day, left: cell.offsetLeft, top: cell.offsetTop },
      );
    },
    [heatmap.days],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-2">
          {/* Gutter of days. The top offset (mt-4 = 16px) reproduces the
 month line (10px of text) + the 6px gutter which separates it
 from the grid, so that the lines match each other exactly. */}
          <div
            aria-hidden
            className="mt-4 grid grid-rows-7 gap-1 text-[10px] leading-none text-muted-foreground"
          >
            {weekdayLabels.map((label, row) => (
              <div
                key={row}
                className="flex h-3 items-center justify-end whitespace-nowrap"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            {/* Month labels — one 12px track per week, right overflow */}
            <div className="grid grid-flow-col auto-cols-[12px] gap-1 text-[10px] leading-none text-muted-foreground">
              {monthLabels.map((label, i) => (
                <div key={i} className="overflow-visible whitespace-nowrap">
                  {label}
                </div>
              ))}
            </div>

            {/* Grille : colonnes = semaines, lignes = jours (dim → sam) */}
            <div
              className="relative grid grid-flow-col grid-rows-7 gap-1"
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHovered(null)}
            >
              {heatmap.days.map((day, i) => {
                const joined = day.date === joinedDate;
                // “3 tickets · 2 tasks · March 12” — the textual equivalent of
                // tooltip detail, for screen readers.
                const parts: string[] = [];
                if (joined) parts.push(t("dayJoined"));
                if (day.issues > 0) parts.push(t("dayIssues", { count: day.issues }));
                if (day.tasks > 0) parts.push(t("dayTasks", { count: day.tasks }));
                if (parts.length === 0) parts.push(t("dayNone"));
                const label = `${parts.join(" · ")} · ${format.dateTime(
                  parseYmd(day.date),
                  { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" },
                )}`;
                return (
                  <div
                    key={day.date}
                    data-day-index={i}
                    aria-label={label}
                    className={`${CELL} ${
                      joined
                        ? JOINED_CLASS
                        : LEVEL_CLASSES[levelOf(day.count, heatmap.max)]
                    }`}
                  />
                );
              })}

              {/* Invisible anchoring of the tooltip, moved to the hovered box.
 `key` on the content: remounting forces Radix to recalculate its
 position when sliding from one box to another. */}
              <Tooltip open={hovered !== null}>
                <TooltipTrigger asChild>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute size-3"
                    style={{ left: hovered?.left ?? 0, top: hovered?.top ?? 0 }}
                  />
                </TooltipTrigger>
                {hovered ? (
                  <TooltipContent
                    key={hovered.day.date}
                    className="max-w-none text-left"
                  >
                    <DayDetail
                      day={hovered.day}
                      joined={hovered.day.date === joinedDate}
                    />
                  </TooltipContent>
                ) : null}
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
        <span>{t("less")}</span>
        {LEVEL_CLASSES.map((cls, i) => (
          <span key={i} className={`${CELL} ${cls}`} />
        ))}
        <span>{t("more")}</span>
      </div>
    </div>
  );
}
