"use client";

import { memo, useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "mangue-ui";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { StatusMeta, IssueStatus } from "@/lib/issue-constants";
import type {
  Category,
  Issue,
  IssueRelationType,
  IssueUpdateInput,
  Member,
  Objective,
} from "@/lib/types";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { ScrollFadeEdges } from "@/components/scroll-fade-edges";
import { IssueCard } from "@/components/issue-card";
import { StatusIndicator } from "@/components/issue-indicators";
import type { ChipRelation } from "@/components/relation-chips";
import type { ContextMenuAction } from "@/components/issue-context-menu";

/**
 * ⚠ Mémoïsée (MIN-316). Le board rejouait ses colonnes — donc toutes leurs
 * cartes — à chaque rendu du board, y compris pour un état qui ne les
 * concerne pas. Ses props doivent rester stables pour que ça morde.
 */
export const KanbanColumn = memo(function KanbanColumn({
  status,
  issues,
  issueMap,
  relationsByIssue,
  candidateIssues,
  projectId,
  projectKey,
  memberMap,
  categoryMap,
  objectiveMap,
  onOpenIssue,
  onOpenIssueById,
  onOpenPlan,
  onCreateIssue,
  onUpdateIssue,
  onSetCategories,
  onAddRelation,
  onDeleteIssue,
  buildMenuActions,
  currentCycleId,
  selectedIds,
  draggingIds,
  onSelect,
}: {
  status: StatusMeta;
  issues: Issue[];
  /** All project issues by id — used to resolve a sub-issue's parent. */
  issueMap: Map<string, Issue>;
  /** Resolved relation chips per issue id (MIN-25). */
  relationsByIssue: Map<string, ChipRelation[]>;
  /** All project issues — candidates for the "add relation" picker. */
  candidateIssues: Issue[];
  projectId: string;
  projectKey: string;
  memberMap: Map<string, Member>;
  categoryMap: Map<string, Category>;
  objectiveMap?: Map<string, Objective>;
  onOpenIssue: (issue: Issue) => void;
  onOpenIssueById: (issueId: string) => void;
  onOpenPlan: (issue: Issue) => void;
  onCreateIssue: (status: IssueStatus) => void;
  onUpdateIssue: (issueId: string, patch: IssueUpdateInput) => void;
  onSetCategories: (issueId: string, ids: string[]) => void;
  onAddRelation: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string
  ) => void;
  /** Corbeille depuis le clic droit d'une carte (absent → l'entrée disparaît). */
  onDeleteIssue?: (issueId: string) => Promise<void>;
  /** Per-issue extra right-click actions (cycle add/remove — MIN-32). */
  buildMenuActions?: (issue: Issue) => ContextMenuAction[];
  /** My current cycle's id — its cards show the blue cycle icon. */
  currentCycleId?: string | null;
  selectedIds: Set<string>;
  /** Les tickets embarqués par le glisser en cours — estompés comme la carte
      saisie, pour qu'on voie ce que le paquet contient. */
  draggingIds?: Set<string>;
  onSelect: (issueId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.value });
  const { ref: fadeRef, scrollProps, edges } = useScrollFade<HTMLDivElement>();
  const t = useTranslations("Board");
  const ts = useTranslations("Status");

  // dnd-kit needs the droppable node; useScrollFade needs it to measure scroll.
  const setScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      fadeRef(node);
    },
    [setNodeRef, fadeRef]
  );

  return (
    <div className="flex w-full shrink-0 snap-center flex-col desktop:w-[22rem]">
      <div className="mb-2 flex items-center gap-2 px-1">
        <StatusIndicator status={status.value} className="size-4" />
        <h2 className="text-sm font-semibold">{ts(status.value)}</h2>
        <span className="text-xs text-muted-foreground">{issues.length}</span>
      </div>

      {/* Le fondu de bord est dessiné À CÔTÉ du scroller, jamais dessus : un
          `mask-image` sur un conteneur qui défile le fait re-compositer à
          chaque image (MIN-319). D'où ce parent `relative`. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={setScrollRef}
          onScroll={scrollProps.onScroll}
          className={cn(
            "no-scrollbar flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-xl p-2 transition-colors",
            isOver && "bg-muted/50"
          )}
        >
          <SortableContext
            items={issues.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            {issues.map((issue) => {
              const parent = issue.parent_id
                ? issueMap.get(issue.parent_id) ?? null
                : null;
              return (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  projectId={projectId}
                  projectKey={projectKey}
                  memberMap={memberMap}
                  categoryMap={categoryMap}
                  objectiveMap={objectiveMap}
                  parent={parent}
                  relations={relationsByIssue.get(issue.id)}
                  candidateIssues={candidateIssues}
                  onOpenRelated={onOpenIssueById}
                  onAddRelation={onAddRelation}
                  onOpenPlan={onOpenPlan}
                  onOpenIssue={onOpenIssue}
                  onUpdateIssue={onUpdateIssue}
                  onSetCategories={onSetCategories}
                  onDelete={onDeleteIssue}
                  selected={selectedIds.has(issue.id)}
                  dragging={draggingIds?.has(issue.id)}
                  onSelect={onSelect}
                  buildMenuActions={buildMenuActions}
                  inCurrentCycle={!!currentCycleId && issue.cycle_id === currentCycleId}
                />
              );
            })}
          </SortableContext>

          <button
            type="button"
            onClick={() => onCreateIssue(status.value)}
            className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-6 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground"
          >
            <Plus className="size-4" />
            {t("newIssue")}
          </button>
        </div>
        <ScrollFadeEdges edges={edges} />
      </div>
    </div>
  );
});
