"use client";

// Numo's context pill: what the assistant has in front of him, a
// chose par pilule.
//
// The DRAWING (concentric rays, superimposed order) lives in
// [components/entity-pill.tsx](../entity-pill.tsx), shared with resources
// of a ticket. What remains here is what is specific to the context:
//
// • A COLOR BY NATURE, to recognize the pill before reading it.
//
// • THE EYE. The ambient context is not an attachment: it cannot be removed
// no, we ignore it. The eye appears on hover, turns off the pill (gray, and
// the crossed out eye remains visible to say that there is a way back), and the
// corresponding field leaves the sent context. What we pinned to the
// hand, he withdraws for good — a cross.

import { useTranslations } from "next-intl";
import {
  BookText,
  Eye,
  EyeOff,
  FileText,
  CalendarClock,
  IterationCw,
  Inbox,
  Layers,
  LayoutGrid,
  MessagesSquare,
  Settings2,
  Target,
  X,
} from "lucide-react";
import { cn } from "mangue-ui";
import {
  EntityPill,
  PillIcon,
  PILL_INNER_RADIUS,
  type PillRadius,
} from "@/components/entity-pill";
import { ObjectiveIconBadge } from "@/components/objective-icon";
import { ProjectOrb } from "@/components/project-orb";
import { UserAvatar } from "@/components/user-avatar";
import type {
  AssistantContextChip,
  AssistantContextKind,
} from "@/lib/assistant-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * A color by nature of context: the pill can be recognized from the corner of the eye,
 * before being read. The base remains a 12% shade — it's a benchmark, not a
 * pastille.
 */
const STYLES: Record<
  AssistantContextKind,
  { icon: React.ComponentType<{ className?: string }>; tint: string }
> = {
  issue: {
    icon: FileText,
    tint: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
  },
  issues: {
    icon: Layers,
    tint: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  },
  // The lens does NOT take its shade here: it wears HIS, the one it
  // displayed everywhere else (see below, ObjectiveIconBadge). The entrance remains
  // so that the table covers all context types.
  objective: { icon: Target, tint: "" },
  feedback: {
    icon: MessagesSquare,
    tint: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  },
  // The same clock as the Routines tab and its empty state: a routine is
  // recognized by his face, here and there.
  routine: {
    icon: CalendarClock,
    tint: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  },
  inbox: {
    icon: Inbox,
    tint: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  },
  // The wiki: the same figure as the page tree in the sidebar.
  page: {
    icon: BookText,
    tint: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
  },
  view: {
    icon: LayoutGrid,
    tint: "bg-cyan-500/12 text-cyan-600 dark:text-cyan-400",
  },
  cycle: {
    icon: IterationCw,
    tint: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
  },
  settings: {
    icon: Settings2,
    tint: "bg-slate-500/12 text-slate-600 dark:text-slate-400",
  },
  // Member and project never pass through this table: they carry their
  // its own figure (portrait, orb).
  member: { icon: FileText, tint: "" },
  project: { icon: FileText, tint: "" },
};

export function ContextPill({
  chip,
  radius = "full",
  disabled = false,
  onToggle,
  onRemove,
  className,
}: {
  chip: AssistantContextChip;
  /** Pill radius — icon follows (see PILL_INNER_RADIUS). */
  radius?: PillRadius;
  /** Context deselected: the pill remains, grayed out, and is no longer sent. */
  disabled?: boolean;
  /** Toggles selection (ambient context). Absent = inert pill. */
  onToggle?: () => void;
  /** Remove the pill (hand pinned background). */
  onRemove?: () => void;
  className?: string;
}) {
  const t = useTranslations("Assistant");
  const style = STYLES[chip.kind];
  const Icon = style.icon;
  const action = onRemove ?? onToggle;
  const actionLabel = onRemove
    ? t("contextRemove")
    : disabled
      ? t("contextEnable")
      : t("contextDisable");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <EntityPill
          radius={radius}
          dimmed={disabled}
          ariaLabel={chip.tooltip}
          className={cn("max-w-[14rem] shrink-0", className)}
          action={
            action
              ? {
                  label: actionLabel,
                  onClick: action,
                  // When turned off, the command remains visible: this is the only path
                  // return to context.
                  persistent: disabled,
                  icon: onRemove ? (
                    <X className="size-3" />
                  ) : disabled ? (
                    <EyeOff className="size-3" />
                  ) : (
                    <Eye className="size-3" />
                  ),
                }
              : undefined
          }
        >
          {/* Member and project have a figure of their own — the portrait, the orb (or the
 imported favicon). They wear it as is, without a tinted
 patch around it: a generic icon would say less. */}
          {chip.kind === "member" ? (
            <UserAvatar
              seed={chip.avatarSeed}
              className={cn("size-5 shrink-0", disabled && "grayscale")}
            />
          ) : chip.kind === "project" ? (
            <ProjectOrb
              seed={chip.avatarSeed ?? chip.label}
              iconUrl={chip.iconUrl}
              className={cn(
                "size-5",
                PILL_INNER_RADIUS[radius],
                disabled && "grayscale",
              )}
            />
          ) : chip.kind === "objective" && !disabled ? (
            // An objective has its own color: its target carries it, here as on
            // the board and in a description. Extinguished, the pill falls back on
            // the common gray — it is extinction that we read then, not the objective.
            <ObjectiveIconBadge
              color={chip.color}
              className={cn("size-5", PILL_INNER_RADIUS[radius])}
              iconClassName="h-3 w-3"
            />
          ) : chip.kind === "page" && chip.icon && !disabled ? (
            <PillIcon radius={radius} tint={style.tint}>
              <span className="text-xs leading-none">{chip.icon}</span>
            </PillIcon>
          ) : (
            <PillIcon radius={radius} tint={disabled ? undefined : style.tint}>
              <Icon className="h-3 w-3" />
            </PillIcon>
          )}
          <span
            className={cn(
              "min-w-0 truncate font-medium",
              disabled
                ? "text-muted-foreground line-through"
                : "text-foreground/80",
            )}
          >
            {chip.label}
          </span>
        </EntityPill>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" sideOffset={6}>
        {disabled ? t("contextIgnored", { label: chip.tooltip }) : chip.tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
