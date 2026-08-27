"use client";

import { Fragment, memo, useCallback, useMemo, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "mangue-ui";
import { BOARD_COLUMN_CLASS } from "@/lib/board-layout";
import type { DropPreview } from "@/lib/board-drag";
import {
  BoardDropIndicator,
  BoardDropLandingPlaceholder,
  type BoardLandingPreview,
  useRevealDropIndicator,
} from "@/components/board-drop-indicator";
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
 * ⚠ Memoized (MIN-316). The board replayed its columns — so all their
 * cards — each time the board is rendered, including for a state that does not
 * does not concern. Its props must remain stable for it to bite.
 */
export const GlobalKanbanColumn = memo(function GlobalKanbanColumn({
  status,
  issues,
  projectMap,
  issueMap,
  relationsByIssue,
  getCandidateIssues,
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
  dropPreview,
  landingPreview,
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
  /** Read lazily when a card opens the same-project relation picker. */
  getCandidateIssues?: (projectId: string) => Issue[] | undefined;
  memberMapByProject: Map<string, Map<string, Member>>;
  categoryMapByProject: Map<string, Map<string, Category>>;
  objectiveMapByProject: Map<string, Map<string, Objective>>;
  onOpenIssue: (issue: Issue) => void;
  /** Opens a related issue's side panel (clicking a relation chip). */
  onOpenIssueById?: (issueId: string) => void;
  onOpenPlan: (issue: Issue) => void;
  onUpdateIssue: (
    issueId: string,
    patch: IssueUpdateInput,
    projectId: string,
  ) => void;
  onSetCategories: (issueId: string, ids: string[], projectId: string) => void;
  selectedIds: Set<string>;
  /** Tickets boarded by current swipe — faded with the card entered. */
  draggingIds?: Set<string>;
  /** The drop mark, when dragging is aimed at THIS column. */
  dropPreview?: DropPreview;
  /** The reserved destination slot while the overlay is landing. */
  landingPreview?: BoardLandingPreview;
  onSelect: (issueId: string) => void;
  /** Absent → no "new issue" footer (cycle mode — a create wouldn't join the cycle). */
  onCreateIssue?: (status: IssueStatus) => void;
  /** Adds a relation from a card; the card's project id rides along. */
  onAddRelation?: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string,
    projectId: string,
  ) => void;
  /** Trash from right-clicking a card (the ticket project follows). */
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

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const setScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollerRef.current = node;
      setNodeRef(node);
      fadeRef(node);
    },
    [setNodeRef, fadeRef],
  );
  useRevealDropIndicator(scrollerRef, dropPreview);
  const landingHere = landingPreview?.status === status.value;
  const displayedCount = landingPreview
    ? issues.filter((issue) => !landingPreview.activeIds.has(issue.id)).length +
      (landingHere ? landingPreview.activeIds.size : 0)
    : issues.length;

  /**
   * Cross-project handlers take the project as their final argument, while one
   * column can contain several projects. Bind them once per project so cards do
   * not receive new callback identities on every render (MIN-316).
   */
  const bindToProject = useMemo(() => {
    const cache = new Map<
      string,
      {
        onAddRelation?: (
          sourceId: string,
          type: IssueRelationType,
          targetId: string,
        ) => void;
        onUpdateIssue: (issueId: string, patch: IssueUpdateInput) => void;
        onSetCategories: (issueId: string, ids: string[]) => void;
        onDelete?: (issueId: string) => Promise<void>;
        getCandidateIssues?: () => Issue[] | undefined;
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
          getCandidateIssues: getCandidateIssues
            ? () => getCandidateIssues(pid)
            : undefined,
        };
        cache.set(pid, bound);
      }
      return bound;
    };
  }, [
    getCandidateIssues,
    onAddRelation,
    onUpdateIssue,
    onSetCategories,
    onDeleteIssue,
  ]);

  return (
    <div className={cn("flex flex-col", BOARD_COLUMN_CLASS)}>
      <div className="relative z-30 mb-2 flex items-center gap-2 bg-background px-1">
        <StatusIndicator status={status.value} className="size-4" />
        <h2 className="text-sm font-semibold">{ts(status.value)}</h2>
        <span className="relative top-px text-xs text-muted-foreground">
          {displayedCount}
        </span>
      </div>

      {/* The edge fade is drawn NEXT to the scroller, never on top of it: a
 `mask-image` on a scrolling container makes it re-compose to
 each image (MIN-319). Hence this parent `relative`. */}
      <div
        className={cn(
          "relative flex min-h-0 flex-1 flex-col rounded-xl",
          // The bottom, its roundness and the reason to keep them OUT of the scroller:
          // cf. KanbanColumn (rounding on what scrolls crops the content).
          (dropPreview || landingHere || isOver) && "bg-muted/50",
        )}
      >
        <div
          ref={setScrollRef}
          data-board-column-scroller
          data-board-column-status={status.value}
          onScroll={scrollProps.onScroll}
          className="no-scrollbar flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2"
        >
          {issues.map((issue) => {
            const project = projectMap.get(issue.project_id);
            const pid = issue.project_id;
            const bound = bindToProject(pid);
            const parent = issue.parent_id
              ? (issueMap.get(issue.parent_id) ?? null)
              : null;
            return (
              <Fragment key={issue.id}>
                {landingHere && landingPreview.beforeIssueId === issue.id && (
                  <BoardDropLandingPlaceholder height={landingPreview.height} />
                )}
                {dropPreview?.beforeIssueId === issue.id && (
                  <BoardDropIndicator count={dropPreview.count} />
                )}
                <IssueCard
                  issue={issue}
                  projectId={pid}
                  projectKey={project?.key ?? ""}
                  project={project}
                  memberMap={memberMapByProject.get(pid) ?? EMPTY_MEMBERS}
                  categoryMap={
                    categoryMapByProject.get(pid) ?? EMPTY_CATEGORIES
                  }
                  objectiveMap={
                    objectiveMapByProject.get(pid) ?? EMPTY_OBJECTIVES
                  }
                  parent={parent}
                  relations={relationsByIssue?.get(issue.id)}
                  getCandidateIssues={bound.getCandidateIssues}
                  onOpenRelated={onOpenIssueById}
                  onAddRelation={bound.onAddRelation}
                  onOpenPlan={onOpenPlan}
                  onOpenIssue={onOpenIssue}
                  onUpdateIssue={bound.onUpdateIssue}
                  onSetCategories={bound.onSetCategories}
                  onDelete={bound.onDelete}
                  selected={selectedIds.has(issue.id)}
                  dragging={draggingIds?.has(issue.id)}
                  landingOutOfFlow={
                    landingPreview?.activeIds.has(issue.id) ? true : undefined
                  }
                  onSelect={onSelect}
                  buildMenuActions={buildMenuActions}
                  inCurrentCycle={
                    !!currentCycleId && issue.cycle_id === currentCycleId
                  }
                />
              </Fragment>
            );
          })}
          {/* `beforeIssueId === null`: the packet is placed at the end of the column. */}
          {dropPreview && dropPreview.beforeIssueId === null && (
            <BoardDropIndicator count={dropPreview.count} />
          )}
          {landingHere && landingPreview.beforeIssueId === null && (
            <BoardDropLandingPlaceholder height={landingPreview.height} />
          )}

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
        <ScrollFadeEdges edges={edges} className="z-30" />
      </div>
    </div>
  );
}, sameGlobalKanbanColumnProps);

function sameRelations(
  previous: ChipRelation[] | undefined,
  current: ChipRelation[] | undefined,
) {
  if (previous === current) return true;
  if (!previous || !current || previous.length !== current.length) return false;
  return previous.every((relation, index) => {
    const next = current[index];
    return (
      relation.id === next.id &&
      relation.relation === next.relation &&
      relation.otherId === next.otherId &&
      relation.otherNumber === next.otherNumber &&
      relation.resolved === next.resolved
    );
  });
}

type ComparableGlobalKanbanColumnProps = {
  issues: Issue[];
  issueMap: Map<string, Issue>;
  relationsByIssue?: Map<string, ChipRelation[]>;
};

function sameGlobalKanbanColumnProps(
  previous: ComparableGlobalKanbanColumnProps,
  current: ComparableGlobalKanbanColumnProps,
) {
  const before = previous as unknown as Record<string, unknown>;
  const after = current as unknown as Record<string, unknown>;
  for (const key of Object.keys(before)) {
    if (key === "issueMap" || key === "relationsByIssue") continue;
    if (before[key] !== after[key]) return false;
  }
  for (const issue of current.issues) {
    const parentId = issue.parent_id;
    if (
      parentId &&
      previous.issueMap.get(parentId)?.number !==
        current.issueMap.get(parentId)?.number
    ) {
      return false;
    }
    if (
      !sameRelations(
        previous.relationsByIssue?.get(issue.id),
        current.relationsByIssue?.get(issue.id),
      )
    ) {
      return false;
    }
  }
  return true;
}
