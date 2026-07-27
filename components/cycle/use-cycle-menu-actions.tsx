"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { IterationCw } from "lucide-react";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import type { Issue } from "@/lib/types";

// Adding is only offered for real, living work; removal is always offered for
// an issue already in the current cycle (whatever its status became). Exported
// for the bulk path, which applies the same rule to a whole selection.
export const CYCLE_INELIGIBLE_STATUSES: readonly Issue["status"][] = [
  "done",
  "canceled",
  "duplicate",
  "triage",
];

/**
 * Split a selection into what can still JOIN the current cycle and what can
 * LEAVE it, applying the same eligibility rule as the single-issue action. A
 * mixed selection yields both buckets, so the bulk rows can offer both moves
 * and each only touches the tickets it concerns.
 */
export function splitCycleSelection(
  issues: Issue[],
  currentCycleId: string | null
): { addable: Issue[]; removable: Issue[] } {
  const addable: Issue[] = [];
  const removable: Issue[] = [];
  if (!currentCycleId) return { addable, removable };
  for (const issue of issues) {
    if (issue.cycle_id === currentCycleId) removable.push(issue);
    else if (!CYCLE_INELIGIBLE_STATUSES.includes(issue.status)) addable.push(issue);
  }
  return { addable, removable };
}

/**
 * The right-click "Add to / Remove from cycle" action (MIN-32), shared by the
 * global and project boards. Adding assigns the issue to the cycle's owner as
 * a side-effect and never bumps the status — the caller's `onSetCycle` mirrors
 * that in its optimistic patch.
 */
export function useCycleMenuActions(
  currentCycleId: string | null,
  onSetCycle: (issue: Issue, cycleId: string | null) => void
): (issue: Issue) => ContextMenuAction[] {
  const t = useTranslations("Cycles");

  return useCallback(
    (issue: Issue): ContextMenuAction[] => {
      if (!currentCycleId) return [];
      const inCurrent = issue.cycle_id === currentCycleId;
      if (!inCurrent && CYCLE_INELIGIBLE_STATUSES.includes(issue.status)) return [];
      return [
        {
          id: inCurrent ? "cycle-remove" : "cycle-add",
          label: inCurrent ? t("removeFromCycle") : t("addToCycle"),
          keywords: ["cycle", "semaine", "week", "sprint"],
          icon: <IterationCw className="size-4" />,
          onSelect: () => onSetCycle(issue, inCurrent ? null : currentCycleId),
        },
      ];
    },
    [currentCycleId, onSetCycle, t]
  );
}
