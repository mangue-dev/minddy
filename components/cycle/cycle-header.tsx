"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "mangue-ui";
import { Check, ChevronDown } from "lucide-react";
import { NumoIcon } from "@/components/numo-icon";
import { addDays } from "@/lib/cycle";
import type { BoardCycles, CycleInfo } from "@/lib/types";

/**
 * The cycle-mode header (MIN-32): a date-range title-selector on the left
 * (never a duration word — the dates ARE the identity of a cycle), and on the
 * right — where the filter/sort/view controls normally live — the "Ask Numo"
 * badge input, the capacity ring (% of target points filled; raw points stay
 * hidden) and the intensity label linking to the settings tab.
 */

const day = (date: string) => new Date(`${date}T00:00:00`);

/** "6–19 juil" — the human identity of a cycle. end_date is exclusive. */
export function formatCycleRange(
  format: ReturnType<typeof useFormatter>,
  cycle: Pick<CycleInfo, "start_date" | "end_date">
): string {
  return format.dateTimeRange(day(cycle.start_date), day(addDays(cycle.end_date, -1)), {
    day: "numeric",
    month: "short",
  });
}

export function CycleTitleSelector({
  cycles,
  selectedId,
  onSelect,
}: {
  cycles: BoardCycles;
  /** null = the current cycle. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const t = useTranslations("Cycles");
  const format = useFormatter();

  const selected =
    (selectedId
      ? [cycles.current, ...cycles.upcoming, ...cycles.past].find(
          (c) => c?.id === selectedId
        )
      : cycles.current) ?? cycles.current;
  if (!selected) return null;

  const phaseLabel =
    selected.id === cycles.current?.id
      ? t("currentCycle")
      : cycles.upcoming.some((c) => c.id === selected.id)
        ? t("upcomingCycle")
        : t("pastCycle");

  const entry = (cycle: CycleInfo, label?: string) => (
    <DropdownMenuItem
      key={cycle.id}
      onSelect={() => onSelect(cycle.id === cycles.current?.id ? null : cycle.id)}
    >
      <span className="min-w-0 flex-1 truncate">
        {label ? `${label} · ` : ""}
        {formatCycleRange(format, cycle)}
      </span>
      {cycle.id === selected.id && <Check className="ml-2 size-4 shrink-0" />}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight transition-colors hover:text-muted-foreground"
        >
          {phaseLabel} · {formatCycleRange(format, selected)}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {cycles.current && entry(cycles.current, t("currentCycle"))}
        {cycles.upcoming.map((c) => entry(c, t("upcomingCycle")))}
        {cycles.past.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("pastCycles")}</DropdownMenuLabel>
            {cycles.past.map((c) => entry(c))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** SVG ring, filled clockwise from 12 o'clock — the Pie of issue-indicators,
    as a stroke so it reads as a gauge, not a status. */
function ProgressRing({
  percent,
  colorClass,
  className,
}: {
  percent: number;
  /** Tailwind text-color of the progress arc. */
  colorClass: string;
  className?: string;
}) {
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 16 16" fill="none" className={cn("size-[19px] shrink-0 -rotate-90", className)}>
      <circle cx="8" cy="8" r={r} stroke="currentColor" strokeOpacity="0.15" strokeWidth="2.5" />
      <circle
        cx="8"
        cy="8"
        r={r}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${(Math.min(100, Math.max(0, percent)) / 100) * c} ${c}`}
        className={colorClass}
      />
    </svg>
  );
}

function RingStat({
  percent,
  colorClass,
  tooltip,
}: {
  percent: number;
  colorClass: string;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
          {/* The arc caps at a full circle, but the number is honest — an
              overfilled cycle reads 115%, not a lying 100%. */}
          <ProgressRing percent={percent} colorClass={colorClass} />
          {percent}%
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** The "Ask Numo" badge input — lives on the title-selector line (right end),
    NOT with the progress rings. Submitting opens the assistant scoped to the
    cycle with the message pre-sent. */
export function CycleAskNumo({ onAskNumo }: { onAskNumo: (message: string) => void }) {
  const t = useTranslations("Cycles");
  const [draft, setDraft] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const message = draft.trim();
        if (!message) return;
        onAskNumo(message);
        setDraft("");
      }}
      className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 transition-colors focus-within:border-foreground/30"
    >
      <NumoIcon animated={false} className="size-3.5 shrink-0 text-primary" />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t("askNumoPlaceholder")}
        className="w-44 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </form>
  );
}

/** The gauges of the pills row (replacing the filter/sort controls):
    completion ring, capacity ring, intensity label. */
export function CycleControls({
  cycle,
  filledPoints,
  completionPercent,
}: {
  cycle: CycleInfo;
  filledPoints: number;
  /** Points-weighted share of closed (done/canceled) work; null = empty cycle. */
  completionPercent: number | null;
}) {
  const t = useTranslations("Cycles");
  const capacityPercent =
    cycle.target_points > 0
      ? Math.round((filledPoints / cycle.target_points) * 100)
      : 0;

  return (
    <div className="flex items-center gap-3">
      {completionPercent !== null && (
        <RingStat
          percent={completionPercent}
          colorClass="text-emerald-500"
          tooltip={t("completionTooltip", { percent: completionPercent })}
        />
      )}
      <RingStat
        percent={capacityPercent}
        colorClass="text-primary"
        tooltip={t("capacityTooltip", { percent: capacityPercent })}
      />

      <Link
        href="/settings?tab=cycles"
        className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
      >
        {t(`intensity_${cycle.intensity}`)}
      </Link>
    </div>
  );
}
