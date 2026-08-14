"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { BOARD_COLUMN_CLASS } from "@/lib/board-layout";
import { visibleStatuses } from "@/lib/view-filter";
import { IssueCardBody } from "@/components/issue-card";
import { StatusIndicator } from "@/components/issue-indicators";
import type { ChipRelation } from "@/components/relation-chips";
import type {
  IssueCardCategory,
  IssueCardIssue,
  IssueCardObjective,
  Member,
  ViewConfig,
} from "@/lib/types";

/** One card of the public board, precomputed server-side (parent/relations
    resolve against ALL project issues, which never reach the client).

    `issue` est une PROJECTION, pas un `Issue` (MIN-342) : ce composant est le
    seul destinataire client de la page partagée, donc tout ce qu'il déclare
    finit dans le HTML lu par un anonyme. Voir
    [lib/public-board-projection.ts](lib/public-board-projection.ts). */
export interface PublicCard {
  issue: IssueCardIssue;
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
  /** Déjà TRIÉES côté serveur, dans l'ordre de la vue : le comparateur lit
      `position`, `created_at` et `updated_at`, qu'une carte n'affiche pas et
      qui n'ont donc plus à voyager. */
  cards: PublicCard[];
  config: ViewConfig;
  projectKey: string;
  members: Member[];
  categories: IssueCardCategory[];
  objectives: IssueCardObjective[];
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

  const columns = useMemo(
    () =>
      visibleStatuses(config).map((status) => ({
        status,
        items: cards.filter((c) => c.issue.status === status.value),
      })),
    [cards, config]
  );

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
