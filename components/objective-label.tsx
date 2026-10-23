"use client";

// How an objective reads by name (MIN-785): a rounded pill tinted in its color,
// carrying its status glyph and its name in that color.
//
// One shape everywhere an objective is named — picker options and triggers,
// relation rows, badges, issue cards and the feedback list — in two sizes: `md`
// for controls and rows, `sm` for the compact lines of cards. It is the tint of
// the mention pills, with fully rounded ends: here the pill is a control.
import type { CSSProperties, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { ObjectiveStatusIndicator } from "@/components/issue-indicators";
import { objectiveColor } from "@/components/objective-icon";
import type { PickerOption } from "@/components/search-select";
import { cn } from "@/lib/utils";
import type { Objective } from "@/lib/types";

/**
 * The name in the objective's color, darkened in light mode and lightened in
 * dark mode — the dosage of the database select badges. The raw palette
 * (amber, teal…) fails contrast as text on one of the two backgrounds.
 */
export const OBJECTIVE_TEXT =
  "text-[color:color-mix(in_oklab,var(--objective-color)_75%,black)] dark:text-[color:color-mix(in_oklab,var(--objective-color)_80%,white)]";

/** The variable `OBJECTIVE_TEXT` reads, for text colored without the pill. */
export function objectiveTextStyle(color: string | null | undefined): CSSProperties {
  return { "--objective-color": objectiveColor(color) } as CSSProperties;
}

function objectiveToneStyle(color: string | null | undefined): CSSProperties {
  return {
    "--objective-color": objectiveColor(color),
    backgroundColor: "color-mix(in oklab, var(--objective-color) 12%, transparent)",
  } as CSSProperties;
}

/** The status is optional: the public board projects objectives without it. */
type PillObjective = Pick<Objective, "name" | "color"> & Partial<Pick<Objective, "status">>;

const PILL_SIZES = {
  md: "h-6 gap-1.5 px-2 text-xs [&>svg]:size-3.5",
  sm: "h-5 gap-1 px-1.5 text-[11px] [&>svg]:size-3",
} as const;

/** The pill alone, with no tooltip: safe inside a trigger that has its own. */
export function ObjectivePill({
  objective,
  size = "md",
  className,
}: {
  objective: PillObjective;
  size?: keyof typeof PILL_SIZES;
  className?: string;
}) {
  return (
    <span
      data-objective-pill
      className={cn(
        "inline-flex min-w-0 max-w-full shrink items-center rounded-full font-medium leading-none [&>svg]:shrink-0",
        PILL_SIZES[size],
        OBJECTIVE_TEXT,
        className
      )}
      style={objectiveToneStyle(objective.color)}
    >
      {objective.status && <ObjectiveStatusIndicator status={objective.status} />}
      <span className="truncate">{objective.name}</span>
    </span>
  );
}

/** A picker option rendered as the pill; the name stays the search term. */
export function objectivePickerOption(objective: Objective): PickerOption {
  return {
    value: objective.id,
    label: objective.name,
    labelNode: <ObjectivePill objective={objective} />,
  };
}

/** The chrome of a trigger whose value is the pill: the pill is the button. */
export const OBJECTIVE_PILL_TRIGGER =
  "flex max-w-full min-w-0 items-center rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:hover:opacity-100";

/** An objective presented on its own: the pill, with its status in words on hover. */
export function ObjectiveBadge({
  objective,
  size = "md",
  className,
  tooltip,
}: {
  objective: PillObjective;
  size?: keyof typeof PILL_SIZES;
  className?: string;
  /** Replaces the status as the hover text. */
  tooltip?: ReactNode;
}) {
  const tStatus = useTranslations("ObjectiveStatus");
  const status = objective.status ? tStatus(objective.status) : null;
  const pill = <ObjectivePill objective={objective} size={size} className={className} />;
  const label = tooltip ?? status;
  return (
    <>
      {label ? <AppTooltip label={label}>{pill}</AppTooltip> : pill}
      {status && <span className="sr-only">, {status}</span>}
    </>
  );
}
