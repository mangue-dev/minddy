"use client";

import { memo, useCallback, useMemo } from "react";
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
  Project,
} from "@/lib/types";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { ScrollFadeEdges } from "@/components/scroll-fade-edges";
import { IssueCard } from "@/components/issue-card";
import { StatusIndicator } from "@/components/issue-indicators";
import type { ChipRelation } from "@/components/relation-chips";
import type { ContextMenuAction } from "@/components/issue-context-menu";

const EMPTY_MEMBERS: Map<string, Member> = new Map();
const EMPTY_CATEGORIES: Map<string, Category> = new Map();
const EMPTY_OBJECTIVES: Map<string, Objective> = new Map();

/**
 * One status column of the cross-project kanban (MIN-29). Same droppable +
 * sortable machinery as <KanbanColumn>, but every card is fed its OWN project's
 * key/members/categories/objectives (looked up by `issue.project_id`) so it's a
 * fully interactive project card. The "new issue" footer opens the app-wide
 * create dialog with this column's status preset (the dialog's split button
 * picks the target project — MIN-33). No relation affordances (per-project).
 */
/**
 * ⚠ Mémoïsée (MIN-316). Le board rejouait ses colonnes — donc toutes leurs
 * cartes — à chaque rendu du board, y compris pour un état qui ne les
 * concerne pas. Ses props doivent rester stables pour que ça morde.
 */
export const GlobalKanbanColumn = memo(function GlobalKanbanColumn({
  status,
  issues,
  projectMap,
  issueMap,
  relationsByIssue,
  issuesByProject,
  memberMapByProject,
  categoryMapByProject,
  objectiveMapByProject,
  onOpenIssue,
  onOpenIssueById,
  onOpenPlan,
  onUpdateIssue,
  onSetCategories,
  selectedIds,
  draggingIds,
  onSelect,
  onCreateIssue,
  onAddRelation,
  onDeleteIssue,
  buildMenuActions,
  currentCycleId,
}: {
  status: StatusMeta;
  issues: Issue[];
  projectMap: Map<string, Project>;
  /** Every board issue by id — resolves a sub-issue's parent (same project). */
  issueMap: Map<string, Issue>;
  /** Resolved relation chips per issue id (MIN-25). */
  relationsByIssue?: Map<string, ChipRelation[]>;
  /** All board issues per project — candidates for the "add relation" picker
      (relations are same-project by construction). */
  issuesByProject?: Map<string, Issue[]>;
  memberMapByProject: Map<string, Map<string, Member>>;
  categoryMapByProject: Map<string, Map<string, Category>>;
  objectiveMapByProject: Map<string, Map<string, Objective>>;
  onOpenIssue: (issue: Issue) => void;
  /** Opens a related issue's side panel (clicking a relation chip). */
  onOpenIssueById?: (issueId: string) => void;
  onOpenPlan: (issue: Issue) => void;
  onUpdateIssue: (issueId: string, patch: IssueUpdateInput, projectId: string) => void;
  onSetCategories: (issueId: string, ids: string[], projectId: string) => void;
  selectedIds: Set<string>;
  /** Les tickets embarqués par le glisser en cours — estompés avec la carte saisie. */
  draggingIds?: Set<string>;
  onSelect: (issueId: string) => void;
  /** Absent → no "new issue" footer (cycle mode — a create wouldn't join the cycle). */
  onCreateIssue?: (status: IssueStatus) => void;
  /** Adds a relation from a card; the card's project id rides along. */
  onAddRelation?: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string,
    projectId: string
  ) => void;
  /** Corbeille depuis le clic droit d'une carte (le projet du ticket suit). */
  onDeleteIssue?: (issueId: string, projectId: string) => Promise<void>;
  /** Per-issue extra right-click actions (cycle add/remove — MIN-32). */
  buildMenuActions?: (issue: Issue) => ContextMenuAction[];
  /** My current cycle's id — its cards show the blue cycle icon. */
  currentCycleId?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.value });
  const { ref: fadeRef, scrollProps, edges } = useScrollFade<HTMLDivElement>();
  const t = useTranslations("Board");
  const ts = useTranslations("Status");

  const setScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      fadeRef(node);
    },
    [setNodeRef, fadeRef]
  );

  /**
   * Les handlers du board cross-projet prennent le projet en DERNIER argument, et
   * une colonne d'ici mélange les projets. On les lie donc PAR PROJET, une fois
   * pour toutes, plutôt qu'avec une fléchée neuve par carte et par rendu — sans
   * quoi `memo` sur `IssueCard` ne mordrait sur rien (MIN-316).
   */
  const bindToProject = useMemo(() => {
    const cache = new Map<
      string,
      {
        onAddRelation?: (
          sourceId: string,
          type: IssueRelationType,
          targetId: string
        ) => void;
        onUpdateIssue: (issueId: string, patch: IssueUpdateInput) => void;
        onSetCategories: (issueId: string, ids: string[]) => void;
        onDelete?: (issueId: string) => Promise<void>;
      }
    >();
    return (pid: string) => {
      let bound = cache.get(pid);
      if (!bound) {
        bound = {
          onAddRelation: onAddRelation
            ? (sourceId, type, targetId) =>
                onAddRelation(sourceId, type, targetId, pid)
            : undefined,
          onUpdateIssue: (id, patch) => onUpdateIssue(id, patch, pid),
          onSetCategories: (id, ids) => onSetCategories(id, ids, pid),
          onDelete: onDeleteIssue
            ? (id: string) => onDeleteIssue(id, pid)
            : undefined,
        };
        cache.set(pid, bound);
      }
      return bound;
    };
  }, [onAddRelation, onUpdateIssue, onSetCategories, onDeleteIssue]);

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
              const project = projectMap.get(issue.project_id);
              const pid = issue.project_id;
              const bound = bindToProject(pid);
              const parent = issue.parent_id
                ? issueMap.get(issue.parent_id) ?? null
                : null;
              return (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  projectId={pid}
                  projectKey={project?.key ?? ""}
                  project={project}
                  memberMap={memberMapByProject.get(pid) ?? EMPTY_MEMBERS}
                  categoryMap={categoryMapByProject.get(pid) ?? EMPTY_CATEGORIES}
                  objectiveMap={objectiveMapByProject.get(pid) ?? EMPTY_OBJECTIVES}
                  parent={parent}
                  relations={relationsByIssue?.get(issue.id)}
                  candidateIssues={issuesByProject?.get(pid)}
                  onOpenRelated={onOpenIssueById}
                  onAddRelation={bound.onAddRelation}
                  onOpenPlan={onOpenPlan}
                  onOpenIssue={onOpenIssue}
                  onUpdateIssue={bound.onUpdateIssue}
                  onSetCategories={bound.onSetCategories}
                  onDelete={bound.onDelete}
                  selected={selectedIds.has(issue.id)}
                  dragging={draggingIds?.has(issue.id)}
                  onSelect={onSelect}
                  buildMenuActions={buildMenuActions}
                  inCurrentCycle={!!currentCycleId && issue.cycle_id === currentCycleId}
                />
              );
            })}
          </SortableContext>

          {onCreateIssue && (
            <button
              type="button"
              onClick={() => onCreateIssue(status.value)}
              className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-6 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground"
            >
              <Plus className="size-4" />
              {t("newIssue")}
            </button>
          )}
        </div>
        <ScrollFadeEdges edges={edges} />
      </div>
    </div>
  );
});
