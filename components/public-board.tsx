"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { BOARD_COLUMN_CLASS } from "@/lib/board-layout";
import { issueComparator, visibleStatuses } from "@/lib/view-filter";
import { IssueCardBody } from "@/components/issue-card";
import { StatusIndicator } from "@/components/issue-indicators";
import type { ChipRelation } from "@/components/relation-chips";
import type { Category, Issue, Member, Objective, ViewConfig } from "@/lib/types";

/** One card of the public board, precomputed server-side (parent/relations
    resolve against ALL project issues, which never reach the client). */
export interface PublicCard {
  issue: Issue;
  parentNumber?: number;
  relations?: ChipRelation[];
}

/**
 * Read-only kanban of a shared view (MIN-26) — the presentational subset of
 * KanbanBoard: same columns and card body, no DnD, no create/edit, no side
 * panel. Props are plain JSON (RSC boundary): maps and visible statuses are
 * derived here, and IssueCardBody gets no callbacks so every indicator
 * renders static.
 */
export function PublicBoard({
  cards,
  config,
  projectKey,
  members,
  categories,
  objectives,
}: {
  cards: PublicCard[];
  config: ViewConfig;
  projectKey: string;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
}) {
  const ts = useTranslations("Status");

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members]
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );
  const objectiveMap = useMemo(
    () => new Map(objectives.map((o) => [o.id, o])),
    [objectives]
  );

  const columns = useMemo(() => {
    const cmp = issueComparator(config.sort);
    return visibleStatuses(config).map((status) => ({
      status,
      items: cards
        .filter((c) => c.issue.status === status.value)
        .sort((a, b) => cmp(a.issue, b.issue)),
    }));
  }, [cards, config]);

  return (
    <div className="flex h-full snap-x snap-mandatory gap-3 overflow-x-auto desktop:snap-none">
      {columns.map(({ status, items }) => (
        <div
          key={status.value}
          className={cn("flex flex-col", BOARD_COLUMN_CLASS)}
        >
          <div className="mb-2 flex items-center gap-2 px-1">
            <StatusIndicator status={status.value} className="size-4" />
            <h2 className="text-sm font-semibold">{ts(status.value)}</h2>
            <span className="text-xs text-muted-foreground">{items.length}</span>
          </div>

          <div className="no-scrollbar flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-xl p-2">
            {items.map((card) => (
              <IssueCardBody
                key={card.issue.id}
                issue={card.issue}
                projectKey={projectKey}
                memberMap={memberMap}
                categoryMap={categoryMap}
                objectiveMap={objectiveMap}
                parentNumber={card.parentNumber}
                relations={card.relations}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
