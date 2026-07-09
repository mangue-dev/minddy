"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Skeleton, toast } from "mangue-ui";
import { ListTodo } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useCreate } from "@/lib/create-context";
import { useGlobalBoardQuery } from "@/lib/use-global-board-query";
import { useBoardViews } from "@/lib/use-board-views";
import { filterIssues, visibleStatuses } from "@/lib/view-filter";
import { STATUSES } from "@/lib/issue-constants";
import {
  cycleCompletionPercent,
  cycleFilledPoints,
  recoComparator,
} from "@/lib/cycle";
import {
  useAssistantContext,
  useAssistantPanel,
} from "@/lib/assistant-panel-context";
import { GlobalKanbanBoard } from "@/components/global-kanban-board";
import { BoardToolbar } from "@/components/board-toolbar";
import { IssueSidePanel } from "@/components/issue-side-panel";
import {
  CycleControls,
  CycleTitleSelector,
  formatCycleRange,
} from "@/components/cycle/cycle-header";
import {
  CycleActivationWelcome,
  CycleEmptyNotice,
  CycleFutureNotice,
} from "@/components/cycle/cycle-empty-states";
import { useCycleMenuActions } from "@/components/cycle/use-cycle-menu-actions";
import type {
  Category,
  Issue,
  Member,
  Objective,
  Project,
} from "@/lib/types";

/** Remembered "the Cycle tab is selected" flag — deliberately OUTSIDE the view
    system's storage: useBoardViews self-heals unknown view ids by rewriting
    its slot, so a "cycle" sentinel in there would be destroyed on reload. */
const CYCLE_MODE_KEY = "minddy:cycle-mode";

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
  const format = useFormatter();
  const { user } = useAuth();
  const myUserId = user?.id ?? null;
  const { projects } = useProjects();
  const { openCreateIssue } = useCreate();
  const openAssistant = useAssistantPanel().open;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawViewParam = searchParams.get("view");
  // "cycle" is OUR one-shot instruction (the project boards' ↗ tab lands
  // here with it) — never let useBoardViews consume it, or the remembered
  // view restore would be skipped.
  const viewParam = rawViewParam === "cycle" ? null : rawViewParam;
  const {
    issues,
    membersByProject,
    categoriesByProject,
    objectivesByProject,
    relations,
    cycles,
    loading,
    updateIssue,
    moveIssue,
    setCategories,
    deleteIssue,
    createIssue,
    setIssueCycle,
  } = useGlobalBoardQuery();

  const consumeViewParam = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("view");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [searchParams, pathname, router]);

  // Cycle mode (MIN-32) — a MODE of this board, not a saved view. Restored
  // from its own localStorage slot after mount (SSR renders view mode).
  const [cycleMode, setCycleMode] = useState(false);
  // null = the current cycle; a past/upcoming id when browsing the selector.
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const switchCycleMode = useCallback((next: boolean) => {
    setCycleMode(next);
    setSelectedCycleId(null);
    try {
      if (next) window.localStorage.setItem(CYCLE_MODE_KEY, "1");
      else window.localStorage.removeItem(CYCLE_MODE_KEY);
    } catch {
      /* localStorage unavailable — mode just won't be remembered. */
    }
  }, []);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(CYCLE_MODE_KEY)) setCycleMode(true);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (rawViewParam === "cycle") {
      switchCycleMode(true);
      consumeViewParam();
    }
  }, [rawViewParam, switchCycleMode, consumeViewParam]);

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

  // ── Cycle mode derivations ──────────────────────────────────────────────
  const cyclesEnabled = cycles?.enabled === true;
  const selectedCycle = useMemo(() => {
    if (!cycles?.enabled) return null;
    const all = [cycles.current, ...cycles.upcoming, ...cycles.past];
    return (
      (selectedCycleId ? all.find((c) => c?.id === selectedCycleId) : null) ??
      cycles.current
    );
  }, [cycles, selectedCycleId]);
  const selectedPhase: "current" | "future" | "past" = !selectedCycle
    ? "current"
    : selectedCycle.id === cycles?.current?.id
      ? "current"
      : cycles?.upcoming.some((c) => c.id === selectedCycle.id)
        ? "future"
        : "past";
  const cycleIssues = useMemo(
    () =>
      selectedCycle
        ? scopedIssues.filter((i) => i.cycle_id === selectedCycle.id)
        : [],
    [scopedIssues, selectedCycle]
  );
  // Reco ordering: blockers may live outside the cycle, so the status map
  // covers the whole board.
  const cycleComparator = useMemo(() => {
    const statusById = new Map(scopedIssues.map((i) => [i.id, i.status]));
    return recoComparator(relations, statusById);
  }, [scopedIssues, relations]);
  const cycleLabel = selectedCycle ? formatCycleRange(format, selectedCycle) : null;

  // Numo rides along while the cycle is on screen ("remplis mon cycle").
  useAssistantContext(
    cycleMode && selectedCycle && cycleLabel
      ? { cycleId: selectedCycle.id, cycleLabel }
      : null
  );

  const askNumoAboutCycle = useCallback(
    (message: string) => {
      if (!selectedCycle || !cycleLabel) return;
      openAssistant({
        projectId: null,
        prompt: message,
        pageContext: { cycleId: selectedCycle.id, cycleLabel },
      });
    },
    [openAssistant, selectedCycle, cycleLabel]
  );

  // Right-click cycle actions, on every card of this board (both modes).
  const onSetIssueCycle = useCallback(
    (issue: Issue, cycleId: string | null) =>
      void setIssueCycle(issue.id, cycleId, issue.project_id).catch((err) =>
        toast.error((err as Error).message)
      ),
    [setIssueCycle]
  );
  const buildCycleMenuActions = useCycleMenuActions(
    cycles?.enabled ? (cycles.current?.id ?? null) : null,
    onSetIssueCycle
  );

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

  const boardHandlers = {
    onOpenIssue: (issue: Issue) => {
      setOpenIssueId(issue.id);
      setOpenIssueTab("description");
    },
    onOpenPlan: (issue: Issue) => {
      setOpenIssueId(issue.id);
      setOpenIssueTab("plan");
    },
    onUpdateIssue: (id: string, patch: Parameters<typeof updateIssue>[1], pid: string) =>
      void updateIssue(id, patch, pid).catch((err) =>
        toast.error((err as Error).message)
      ),
    onSetCategories: setCategories,
    onMove: moveIssue,
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-3 px-6 pt-4">
        {cycleMode && cycles?.enabled && selectedCycle ? (
          <CycleTitleSelector
            cycles={cycles}
            selectedId={selectedCycleId}
            onSelect={setSelectedCycleId}
          />
        ) : (
          <h1 className="font-display text-lg font-semibold tracking-tight">
            {cycleMode ? tBoard("cycleTab") : t("allTitle")}
          </h1>
        )}
        <BoardToolbar
          views={views}
          activeViewId={cycleMode ? null : activeViewId}
          generatingViewIds={NO_GENERATING}
          onSelectView={(id) => {
            if (cycleMode) switchCycleMode(false);
            selectView(id);
          }}
          config={config}
          onConfigChange={setConfig}
          members={unionMembers}
          categories={NO_CATEGORIES}
          objectives={NO_OBJECTIVES}
          integrations={NO_INTEGRATIONS}
          projects={projects}
          dirty={cycleMode ? false : dirty}
          onCreateView={handleCreateView}
          onUpdateActiveView={saveActiveView}
          onRenameView={renameView}
          onDeleteView={deleteView}
          withNumo={false}
          withShare={false}
          onAskNumo={() => {}}
          cycleTab={{
            active: cycleMode,
            onSelect: () => switchCycleMode(true),
          }}
          rightControls={
            cycleMode ? (
              cyclesEnabled && selectedCycle ? (
                <CycleControls
                  cycle={selectedCycle}
                  filledPoints={cycleFilledPoints(cycleIssues)}
                  completionPercent={cycleCompletionPercent(cycleIssues)}
                  onAskNumo={askNumoAboutCycle}
                />
              ) : (
                <span aria-hidden />
              )
            ) : undefined
          }
        />
      </div>

      {cycleMode ? (
        !cyclesEnabled ? (
          <CycleActivationWelcome />
        ) : !selectedCycle ? (
          <CycleEmptyNotice />
        ) : selectedPhase === "future" ? (
          <CycleFutureNotice cycle={selectedCycle} />
        ) : cycleIssues.length === 0 ? (
          <CycleEmptyNotice />
        ) : (
          <div className="min-h-0 flex-1 pt-3">
            <GlobalKanbanBoard
              issues={cycleIssues}
              statuses={STATUSES}
              sort="manual"
              comparator={cycleComparator}
              readOnly={selectedPhase !== "current"}
              buildMenuActions={
                selectedPhase === "current" ? buildCycleMenuActions : undefined
              }
              projectMap={projectMap}
              memberMapByProject={memberMapByProject}
              categoryMapByProject={categoryMapByProject}
              objectiveMapByProject={objectiveMapByProject}
              {...boardHandlers}
            />
          </div>
        )
      ) : filtered.length === 0 ? (
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
            buildMenuActions={buildCycleMenuActions}
            currentCycleId={cycles?.enabled ? (cycles.current?.id ?? null) : null}
            onCreateIssue={(status) => openCreateIssue({ status })}
            {...boardHandlers}
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
