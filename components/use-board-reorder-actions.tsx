"use client";

import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown02Icon, ArrowUp02Icon, ArrowUpDoubleIcon, ArrangeIcon } from "@hugeicons/core-free-icons";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { planKeyboardMove, type KeyboardMoveDirection, type PlannedMove } from "@/lib/board-drag";
import type { IssueStatus } from "@/lib/issue-constants";
import type { Issue } from "@/lib/types";

const DIRECTIONS: readonly KeyboardMoveDirection[] = ["up", "down", "top"];

/** Puts focus back on a card the reorder moved, if the move dropped it. */
function refocusCard(issueId: string) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    document.querySelector<HTMLElement>(`[data-issue-id="${CSS.escape(issueId)}"]`)?.focus({ preventScroll: true });
  }));
}

/**
 * The card menu's "Reorder" entries (WCAG 2.5.7): the gesture that reorders a
 * column by dragging, without dragging. Offered only where a drop would
 * reorder, under manual sort; the position comes from the same calculation as
 * a drop on the card's neighbor. The columns are read at selection time, so
 * the builder keeps its identity and the cards do not re-render with them.
 */
export function useBoardReorderActions({
  columns,
  enabled,
  move,
  extra,
}: {
  columns: ReadonlyArray<{ status: { value: IssueStatus }; items: Issue[] }>;
  /** Manual sort, outside cycle order. */
  enabled: boolean;
  move: (planned: PlannedMove) => Promise<void>;
  /** The board's other per-card entries, listed after these. */
  extra?: (issue: Issue) => ContextMenuAction[];
}): ((issue: Issue) => ContextMenuAction[]) | undefined {
  const t = useTranslations("IssueUI");
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const moveRef = useRef(move);
  moveRef.current = move;

  const build = useCallback((issue: Issue): ContextMenuAction[] => {
    const own = extra?.(issue) ?? [];
    if (!enabled) return own;
    const columnItems = (current: Issue) => {
      const items = columnsRef.current.find((column) => column.status.value === current.status)?.items ?? [];
      return [...items].sort((a, b) => a.position - b.position);
    };
    const items = columnItems(issue);
    if (items.length < 2) return own;
    const labels = { up: t("actionMoveUp"), down: t("actionMoveDown"), top: t("actionMoveToTop") };
    const icons = { up: ArrowUp02Icon, down: ArrowDown02Icon, top: ArrowUpDoubleIcon };
    return [
      {
        id: "reorder",
        label: t("actionReorder"),
        keywords: ["reorder", "move", "order", "up", "down", "top", "ordre", "déplacer", "monter", "descendre"],
        icon: <HugeiconsIcon icon={ArrangeIcon} className="size-4" />,
        children: DIRECTIONS.map((direction) => ({
          id: `reorder-${direction}`,
          label: labels[direction],
          icon: <HugeiconsIcon icon={icons[direction]} className="size-4" />,
          disabled: !planKeyboardMove({ issue, direction, columnItems: items }),
          onSelect: () => {
            // Read again: the board may have changed while the menu was open.
            const planned = planKeyboardMove({ issue, direction, columnItems: columnItems(issue) });
            if (!planned) return;
            void moveRef.current(planned).catch((error) => toast.error((error as Error).message));
            refocusCard(issue.id);
          },
        })),
      },
      ...own,
    ];
  }, [enabled, extra, t]);

  return enabled || extra ? build : undefined;
}
