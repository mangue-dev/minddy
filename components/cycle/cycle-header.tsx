"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "mangue-ui";
import { Check, ChevronDown, Settings } from "lucide-react";
import { ProgressRing } from "@/components/progress-ring";
import { addDays } from "@/lib/cycle";
import type { BoardCycles, CycleInfo } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Cycle-mode controls for the shared board header: progress gauges, the
 * date-range selector, and a direct route to cycle settings.
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
        <Button
          variant="ghost"
          size="sm"
          className="max-w-64 gap-1.5 font-normal"
        >
          <span className="truncate">
            {phaseLabel} · {formatCycleRange(format, selected)}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </Button>
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

/** Cycle controls replacing the normal filter/sort/view actions. */
export function CycleControls({
  cycles,
  cycle,
  selectedId,
  onSelect,
  filledPoints,
  completionPercent,
}: {
  cycles: BoardCycles;
  cycle: CycleInfo;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
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
    <div className="flex items-center gap-1.5">
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
      </div>

      <CycleTitleSelector
        cycles={cycles}
        selectedId={selectedId}
        onSelect={onSelect}
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" size="icon-sm">
            <Link href="/settings?tab=cycles" aria-label={t("settingsAction")}>
              <Settings />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("settingsAction")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
