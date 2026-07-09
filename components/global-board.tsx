"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton, toast } from "mangue-ui";
import { ListTodo } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useCreate } from "@/lib/create-context";
import { useGlobalBoardQuery } from "@/lib/use-global-board-query";
import { useBoardViews } from "@/lib/use-board-views";
import { filterIssues, visibleStatuses } from "@/lib/view-filter";
import { GlobalKanbanBoard } from "@/components/global-kanban-board";
import { BoardToolbar } from "@/components/board-toolbar";
import { IssueSidePanel } from "@/components/issue-side-panel";
import type {
  Category,
  Issue,
  Member,
  Objective,
  Project,
} from "@/lib/types";

/** Turn a projectId → rows[] record into a Map of per-project id → row maps. */
function toIdMaps<T extends { id: string }>(
  byProject: Record<string, T[]>
): Map<string, Map<string, T>> {
  const out = new Map<string, Map<string, T>>();
  for (const [pid, rows] of Object.entries(byProject)) {
    out.set(pid, new Map(rows.map((r) => [r.id, r])));
  }
  return out;
}

// Facets that only mean something inside a project — absent on the global
// board (BoardToolbar hides a facet when its list is empty). No Numo either
// (project-scoped), so no view is ever "generating".
const NO_CATEGORIES: Category[] = [];
const NO_OBJECTIVES: Objective[] = [];
const NO_INTEGRATIONS: never[] = [];
const NO_GENERATING = new Set<string>();

/**
 * The cross-project "Tous les tickets" board (MIN-29). A real kanban: issues
 * from every project are grouped by status, each card is a fully interactive
 * project card (drag to change status, inline pickers, origin project chip),
 * and clicking one opens the full side panel in place — using that issue's own
 * project context (members/categories/objectives). Views are DB-backed like a
 * project board's, but global (project_id NULL) and always personal — incl.
 * the "Mes tickets" system view.
 */
function GlobalBoardInner() {
  const t = useTranslations("GlobalBoard");
  const tBoard = useTranslations("Board");
  const { user } = useAuth();
  const myUserId = user?.id ?? null;
  const { projects } = useProjects();
  const { openCreateIssue } = useCreate();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const {
    issues,
    membersByProject,
    categoriesByProject,
    objectivesByProject,
    loading,
    updateIssue,
    moveIssue,
    setCategories,
    deleteIssue,
    createIssue,
  } = useGlobalBoardQuery();

  const consumeViewParam = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("view");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [searchParams, pathname, router]);

  const {
    views,
    viewsLoading,
    activeView,
    activeViewId,
    config,
    setConfig,
    dirty,
    selectView,
    createViewAndSelect,
    saveActiveView,
    renameView,
    deleteView,
  } = useBoardViews(
    { kind: "global" },
    { viewParam, onViewParamConsumed: consumeViewParam }
  );

  const handleCreateView = async (name: string) => {
    await createViewAndSelect(name);
    toast.success(tBoard("viewCreated", { name }));
  };

  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const [openIssueTab, setOpenIssueTab] = useState<"description" | "plan">(
    "description"
  );

  const projectMap = useMemo(
    () => new Map<string, Project>(projects.map((p) => [p.id, p])),
    [projects]
  );

  // Only surface issues from live, listed projects (a soft-deleted project's
  // issues may still slip through RLS but have no card context).
  const scopedIssues = useMemo(
    () => issues.filter((i) => projectMap.has(i.project_id)),
    [issues, projectMap]
  );

  const memberMapByProject = useMemo(() => {
    const out = new Map<string, Map<string, Member>>();
    for (const [pid, list] of Object.entries(membersByProject)) {
      out.set(pid, new Map(list.map((m) => [m.user_id, m])));
    }
    return out;
  }, [membersByProject]);
  const categoryMapByProject = useMemo(
    () => toIdMaps<Category>(categoriesByProject),
    [categoriesByProject]
  );
  const objectiveMapByProject = useMemo(
    () => toIdMaps<Objective>(objectivesByProject),
    [objectivesByProject]
  );

  // Deduped union of members across all projects — the global assignee filter
  // (a user can be a member of several projects).
  const unionMembers = useMemo(() => {
    const seen = new Map<string, Member>();
    for (const list of Object.values(membersByProject)) {
      for (const m of list) if (!seen.has(m.user_id)) seen.set(m.user_id, m);
    }
    return [...seen.values()];
  }, [membersByProject]);

  const filtered = useMemo(
    () => filterIssues(scopedIssues, config, { myUserId }),
    [scopedIssues, config, myUserId]
  );
  const statuses = visibleStatuses(config);

  const issuesByProject = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const i of scopedIssues) {
      const list = map.get(i.project_id);
      if (list) list.push(i);
      else map.set(i.project_id, [i]);
    }
    return map;
  }, [scopedIssues]);

  const openIssue = openIssueId
    ? scopedIssues.find((i) => i.id === openIssueId) ?? null
    : null;
  const openPid = openIssue?.project_id ?? "";
  const openProject = openIssue ? projectMap.get(openPid) : undefined;

  if (loading || viewsLoading) {
    return (
      <div className="min-h-0 flex-1 px-6 pt-4">
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-3 px-6 pt-4">
        <h1 className="font-display text-lg font-semibold tracking-tight">
          {t("allTitle")}
        </h1>
        <BoardToolbar
          views={views}
          activeViewId={activeViewId}
          generatingViewIds={NO_GENERATING}
          onSelectView={selectView}
          config={config}
          onConfigChange={setConfig}
          members={unionMembers}
          categories={NO_CATEGORIES}
          objectives={NO_OBJECTIVES}
          integrations={NO_INTEGRATIONS}
          projects={projects}
          dirty={dirty}
          onCreateView={handleCreateView}
          onUpdateActiveView={saveActiveView}
          onRenameView={renameView}
          onDeleteView={deleteView}
          withNumo={false}
          withShare={false}
          onAskNumo={() => {}}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="min-h-0 flex-1 px-6 pt-4">
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <ListTodo className="size-6" />
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">
              {activeView?.kind === "my" ? t("emptyMy") : t("emptyAll")}
            </p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 pt-3">
          <GlobalKanbanBoard
            issues={filtered}
            statuses={statuses}
            sort={config.sort}
            projectMap={projectMap}
            memberMapByProject={memberMapByProject}
            categoryMapByProject={categoryMapByProject}
            objectiveMapByProject={objectiveMapByProject}
            onOpenIssue={(issue) => {
              setOpenIssueId(issue.id);
              setOpenIssueTab("description");
            }}
            onOpenPlan={(issue) => {
              setOpenIssueId(issue.id);
              setOpenIssueTab("plan");
            }}
            onUpdateIssue={(id, patch, pid) =>
              void updateIssue(id, patch, pid).catch((err) =>
                toast.error((err as Error).message)
              )
            }
            onSetCategories={setCategories}
            onMove={moveIssue}
            onCreateIssue={(status) => openCreateIssue({ status })}
          />
        </div>
      )}

      <IssueSidePanel
        issue={openIssue}
        open={!!openIssue}
        onOpenChange={(next) => {
          if (!next) setOpenIssueId(null);
        }}
        projectKey={openProject?.key ?? ""}
        members={openIssue ? membersByProject[openPid] ?? [] : []}
        categories={openIssue ? categoriesByProject[openPid] ?? [] : []}
        objectives={openIssue ? objectivesByProject[openPid] ?? [] : []}
        allIssues={openIssue ? issuesByProject.get(openPid) ?? [] : []}
        relations={[]}
        onUpdate={(id, patch) => updateIssue(id, patch, openPid)}
        onDelete={(id) => deleteIssue(id, openPid)}
        onSetCategories={(id, ids) => setCategories(id, ids, openPid)}
        onCreate={(input) => createIssue(openPid, input)}
        onOpenIssue={(id) => {
          setOpenIssueId(id);
          setOpenIssueTab("description");
        }}
        onAddRelation={() => {}}
        onRemoveRelation={() => {}}
        initialTab={openIssueTab}
      />
    </div>
  );
}

export function GlobalBoard() {
  return (
    // useSearchParams (the ?view= deep link) requires a Suspense boundary.
    <Suspense
      fallback={
        <div className="min-h-0 flex-1 px-6 pt-4">
          <div className="flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-xl" />
            ))}
          </div>
        </div>
      }
    >
      <GlobalBoardInner />
    </Suspense>
  );
}
