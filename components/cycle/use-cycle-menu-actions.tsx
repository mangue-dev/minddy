"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { IterationCw } from "lucide-react";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import type { Issue } from "@/lib/types";

// Adding is only offered for real, living work; removal is always offered for
// an issue already in the current cycle (whatever its status became). Exported
// for the bulk path, which applies the same rule to a whole selection.
// Closed statuses are here because adding them would be pointless; "triage" is
// here because it's the hard invariant (lib/cycle statusAllowsCycle) — the
// server refuses it, and moving a cycled issue back to triage takes it out.
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
 * global and project boards and the issue panel's "⋯" menu. Adding assigns the
 * issue to the cycle's owner as a side-effect and never bumps the status — the
 * caller's `onSetCycle` mirrors that in its optimistic patch.
 *
 * Adding opens a submenu (MIN-137): the current cycle, or the next one — so a
 * ticket can be planned for the coming fortnight without waiting for it, and
 * without going through the cycle board. Two rules keep the entry honest:
 *   - no next window created (`upcomingCount` at 0) → the plain leaf of before,
 *     rather than a submenu with a single child;
 *   - an issue sitting in EITHER window offers "remove" — otherwise a ticket
 *     just added to the next cycle would be offered "add" all over again.
 */
export function useCycleMenuActions(
  currentCycleId: string | null,
  nextCycleId: string | null,
  onSetCycle: (issue: Issue, cycleId: string | null) => void
): (issue: Issue) => ContextMenuAction[] {
  const t = useTranslations("Cycles");

  return useCallback(
    (issue: Issue): ContextMenuAction[] => {
      if (!currentCycleId) return [];
      const inCycle =
        issue.cycle_id === currentCycleId ||
        (nextCycleId !== null && issue.cycle_id === nextCycleId);
      if (inCycle) {
        return [
          {
            id: "cycle-remove",
            label: t("removeFromCycle"),
            keywords: ["cycle", "semaine", "week", "sprint"],
            icon: <IterationCw className="size-4" />,
            onSelect: () => onSetCycle(issue, null),
          },
        ];
      }
      if (CYCLE_INELIGIBLE_STATUSES.includes(issue.status)) return [];
      return [
        {
          id: "cycle-add",
          label: t("addToCycle"),
          keywords: ["cycle", "semaine", "week", "sprint", "suivant", "next"],
          icon: <IterationCw className="size-4" />,
          ...(nextCycleId
            ? {
                children: [
                  {
                    id: "cycle-add-current",
                    label: t("currentCycle"),
                    onSelect: () => onSetCycle(issue, currentCycleId),
                  },
                  {
                    id: "cycle-add-next",
                    label: t("nextCycle"),
                    onSelect: () => onSetCycle(issue, nextCycleId),
                  },
                ],
              }
            : { onSelect: () => onSetCycle(issue, currentCycleId) }),
        },
      ];
    },
    [currentCycleId, nextCycleId, onSetCycle, t]
  );
}
