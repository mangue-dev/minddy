"use client";

import { expandParam } from "@/lib/ref-registry";
import { resolveIssueRef } from "@/lib/app-urls";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, FolderAddIcon } from "@hugeicons/core-free-icons";
import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { loadIssueSidePanel } from "@/lib/lazy-app-surfaces";
import { useBoardScreen } from "@/lib/use-board-screen";
import { useCycleMode } from "@/lib/use-cycle-mode";
import type { IssuePanelBoardData } from "@/lib/use-issue-panel-data";
import { useRouter } from "next/navigation";
import { AppTabRouteBoundary, useAppTabRoute } from "@/lib/app-tab-route-context";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Kbd } from "@/components/ui/kbd";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useOfferedProjects } from "@/lib/use-offered-projects";
import { useCreate } from "@/lib/create-context";
import { useGlobalBoardQuery } from "@/lib/use-global-board-query";
import { useBoardViews } from "@/lib/use-board-views";
import { usePublishCurrentView } from "@/lib/current-view-context";
import { useAppTabLocalState } from "@/lib/app-tab-local-state";
import { useGeneratingViews } from "@/lib/use-generating-views";
import { buildViewHref } from "@/lib/view-href";
import { boardViewTabHref } from "@/lib/board-view-tab";
import { filterIssues, statusColumns, visibleStatuses } from "@/lib/view-filter";
import { isDeferredBoardStatus } from "@/lib/global-board-reads";
import { StatusFilterMenu } from "@/components/status-filter-menu";
import { isClosedStatus, issueIdentifier, type IssueStatus } from "@/lib/issue-constants";
import {
  boardBlockingContext,
  cycleCompletionPercent,
  cycleFilledPoints,
  recoComparator,
} from "@/lib/cycle";
import {
  useAssistantContext,
  useAssistantPanelActions,
} from "@/lib/assistant-panel-context";
import { issuesPageContext } from "@/lib/assistant-issue-context";
import { EmptyScene } from "@/components/empty-scene";
import { KanbanBoard } from "@/components/kanban-board";
import { multiProjectBoard } from "@/lib/board-projects";
import { BoardToolbar } from "@/components/board-toolbar";
import { CycleControls, formatCycleRange } from "@/components/cycle/cycle-header";
import {
  CycleActivationWelcome,
  CycleCompletedBanner,
  CycleEmptyNotice,
  CycleFutureNotice,
} from "@/components/cycle/cycle-empty-states";
import { useCycleMenuActions } from "@/components/cycle/use-cycle-menu-actions";
import { BoardLoadingSkeleton } from "@/components/board-loading-skeleton";
import { BOARD_ICON } from "@/components/feature-icons";
import type { Issue, Member, Project } from "@/lib/types";
import { boardIntegrationFacets } from "@/lib/board-integrations";
import { PageScroll } from "@/components/page-scroll";

// Like the project board: the panel (editor, timeline, Markdown) loads after
// the first content or on the first opened issue, not with the board (MIN-880).
const IssueSidePanel = dynamic(() => loadIssueSidePanel().then((m) => m.IssueSidePanel), { ssr: false });

/**
 * The cross-project “All tickets” board (MIN-29). A real kanban: issues
 * from every project are grouped by status, each card is a fully interactive
 * project card (drag to change status, inline pickers, origin project chip),
 * and clicking one opens the full side panel in place — using that issue's own
 * project context (members/categories/objectives). Views are DB-backed like a
 * project board's, but global (project_id NULL) and always personal — including
 * the "My issues" system view.
 */
function GlobalBoardInner() {
  const t = useTranslations("GlobalBoard");
  const tMeta = useTranslations("Meta");
  const tBoard = useTranslations("Board");
  const tProjects = useTranslations("Projects");
  const format = useFormatter();
  const { user } = useAuth();
  const myUserId = user?.id ?? null;
  const { projects, openCreateProject, loading: projectsLoading } = useProjects();
  const { openCreateIssue } = useCreate();
  const { openIntent } = useAssistantPanelActions();
  const router = useRouter();
  const { pathname, searchParams } = useAppTabRoute();
  const rawViewParam = expandParam(searchParams.get("view"));
  // "cycle" is OUR one-shot instruction (the project boards' ↗ tab lands
  // here with it) — never let useBoardViews consume it, or the remembered
  // view restore would be skipped.
  const viewParam = rawViewParam === "cycle" ? null : rawViewParam;
  const boardScrollPosition = useRef(0);
  const {
    issues,
    membersByProject,
    categoriesByProject,
    objectivesByProject,
    integrationsByProject,
    relations,
    cycles,
    loading,
    deferredPending,
    updateIssue,
    moveIssue,
    setCategories,
    deleteIssue,
    setIssueCycle,
    addRelation,
    removeRelation,
  } = useGlobalBoardQuery();

  const consumeViewParam = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("view");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [searchParams, pathname, router]);

  // Cycle mode (MIN-32) is a mode of this board, not a saved view.
  const [cycleMode, setCycleMode] = useCycleMode();
  // null = the current cycle; a past/upcoming id when browsing the selector.
  const [selectedCycleId, setSelectedCycleId] = useAppTabLocalState<string | null>("global-selected-cycle", null);
  const switchCycleMode = useCallback((next: boolean) => {
    setCycleMode(next);
    setSelectedCycleId(null);
  }, [setCycleMode, setSelectedCycleId]);
  useEffect(() => {
    if (rawViewParam === "cycle") {
      if (!cycleMode) switchCycleMode(true);
      consumeViewParam();
      return;
    }
    // `?view=<id>` names a VIEW, so not the cycle — and cycle mode is stored
    // on its own. Without leaving it here, a `?view=` link opened while cycle
    // mode was remembered selected the view underneath but kept showing the
    // cycle. The same gesture as clicking a view tab in the toolbar, which
    // leaves the cycle before selecting.
    if (rawViewParam) switchCycleMode(false);
  }, [rawViewParam, switchCycleMode, consumeViewParam, cycleMode]);

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

  // Views Numo is currently filling in (id → the updated_at at hand-off). Same
  // mechanism as the project board: the pill spins until Numo bumps the view's
  // updated_at (realtime) or the safety timeout fires.
  const { generatingViewIds, beginGenerating } = useGeneratingViews(views);

  const { panel, handleCreateView, handleAskAI } = useBoardScreen({
    projectId: null,
    activeView,
    createViewAndSelect,
    beginGenerating,
  });

  // A project I hid is not on this board at all (MIN-751): neither its issues
  // nor its members, categories, objectives and integrations in the filters.
  const listedProjects = useOfferedProjects(projects);
  const projectMap = useMemo(
    () => new Map<string, Project>(listedProjects.map((p) => [p.id, p])),
    [listedProjects]
  );
  const listedEntries = useCallback(
    <T,>(byProject: Record<string, T[]>) =>
      Object.entries(byProject).filter(([pid]) => projectMap.has(pid)),
    [projectMap]
  );

  // Only surface issues from live, listed projects (a soft-deleted project's
  // issues may still slip through RLS but have no card context).
  const scopedIssues = useMemo(
    () => issues.filter((i) => projectMap.has(i.project_id)),
    [issues, projectMap]
  );

  // Each card resolves its own project's key, members, categories and
  // objectives, and shows that project's chip.
  const boardProjects = useMemo(
    () =>
      multiProjectBoard(
        projectMap.values(),
        membersByProject,
        categoriesByProject,
        objectivesByProject
      ),
    [projectMap, membersByProject, categoriesByProject, objectivesByProject]
  );

  // Deduped union of members across all projects — the global assignee filter
  // (a user can be a member of several projects).
  const unionMembers = useMemo(() => {
    const seen = new Map<string, Member>();
    for (const [, list] of listedEntries(membersByProject)) {
      for (const m of list) if (!seen.has(m.user_id)) seen.set(m.user_id, m);
    }
    return [...seen.values()];
  }, [membersByProject, listedEntries]);

  // Flat cross-project facet lists. Each is every project's entities concatenated
  // — the toolbar's `groupFacetsByName` then collapses same-named rows (e.g. a
  // "Bug" category in several projects) into one that filters all their ids.
  const allCategories = useMemo(
    () => listedEntries(categoriesByProject).flatMap(([, list]) => list),
    [categoriesByProject, listedEntries]
  );
  const allObjectives = useMemo(
    () => listedEntries(objectivesByProject).flatMap(([, list]) => list),
    [objectivesByProject, listedEntries]
  );
  const allIntegrations = useMemo(
    () =>
      boardIntegrationFacets(
        listedEntries(integrationsByProject).flatMap(([, list]) => list),
        scopedIssues,
      ),
    [integrationsByProject, scopedIssues, listedEntries]
  );

  const filtered = useMemo(
    () => filterIssues(scopedIssues, config, { myUserId }),
    [scopedIssues, config, myUserId]
  );
  const statuses = useMemo(() => visibleStatuses(config), [config]);

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
  // The cycle board has no saved view: its own status filter (MIN-736) shows
  // the open columns until Done or Canceled is chosen. Progress, capacity and
  // the completion banner still read every issue of the cycle.
  const [cycleStatusFilter, setCycleStatusFilter] = useAppTabLocalState<
    IssueStatus[] | null
  >("global-cycle-status", null);
  const cycleStatuses = useMemo(
    () => statusColumns(cycleStatusFilter),
    [cycleStatusFilter]
  );
  const cycleBoardIssues = useMemo(() => {
    const shown = new Set(cycleStatuses.map((s) => s.value));
    return cycleIssues.filter((i) => shown.has(i.status));
  }, [cycleIssues, cycleStatuses]);
  const currentCycleCompletionPercent = useMemo(() => {
    const currentCycleId = cycles?.current?.id;
    if (!currentCycleId) return null;
    return (
      cycleCompletionPercent(scopedIssues.filter((i) => i.cycle_id === currentCycleId)) ?? 0
    );
  }, [cycles?.current?.id, scopedIssues]);
  // Reco ordering: blockers may live outside the cycle, so the status map
  // covers the whole board, and objective-ended edges block through their
  // issues (MIN-513).
  const cycleComparator = useMemo(() => {
    const { relations: expanded, statusById } = boardBlockingContext(
      scopedIssues,
      relations,
      new Map(allObjectives.map((o) => [o.id, o.status])),
    );
    return recoComparator(expanded, statusById);
  }, [scopedIssues, relations, allObjectives]);
  const cycleLabel = selectedCycle ? formatCycleRange(format, selectedCycle) : null;
  // Every issue of the cycle closed → the "completed" banner offers a refill.
  const cycleFullyCompleted =
    cycleIssues.length > 0 &&
    cycleIssues.every((i) => isClosedStatus(i.status));

  // Cycle mode and the active view are two states kept outside the address
  // (localStorage), and `?view=` restores both for the app tab — "cycle" is the instruction this page consumes
  // in cycle mode, a view id otherwise.
  usePublishCurrentView({
    href: buildViewHref(pathname, searchParams.toString(), {
      view: cycleMode ? "cycle" : activeViewId,
    }),
  });

  // Numo rides along: the cycle while it's on screen ("remplis mon cycle"),
  // otherwise the active global view so "this view" resolves to it.
  useAssistantContext(
    cycleMode && selectedCycle && cycleLabel
      ? { cycleId: selectedCycle.id, cycleLabel }
      : !cycleMode && activeView
        ? { viewId: activeView.id, viewName: activeView.name }
        : null
  );

  // Right-click cycle actions, on every card of this board (both modes).
  const onSetIssueCycle = useCallback(
    (issue: Issue, cycleId: string | null) => void setIssueCycle(issue.id, cycleId),
    [setIssueCycle]
  );
  const buildCycleMenuActions = useCycleMenuActions(
    cycles?.enabled ? (cycles.current?.id ?? null) : null,
    cycles?.enabled ? (cycles.upcoming[0]?.id ?? null) : null,
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

  // A deep link names the issue `MIN-42` or by short code; panels set its id.
  const openIssue = panel.openIssueRef
    ? resolveIssueRef(panel.openIssueRef, scopedIssues) ?? null
    : null;

  // The panel shows the board's own rows of the issue's project rather than
  // reading that project again.
  const panelBoardData = useMemo<IssuePanelBoardData>(() => ({
    scope: "global",
    forProject: (projectId) => projectMap.has(projectId) ? {
      members: membersByProject[projectId] ?? [],
      categories: categoriesByProject[projectId] ?? [],
      objectives: objectivesByProject[projectId] ?? [],
      issues: issuesByProject.get(projectId) ?? [],
      relations,
    } : undefined,
  }), [projectMap, membersByProject, categoriesByProject, objectivesByProject, issuesByProject, relations]);

  // Panel state is local to this component. Keep board actions stable so opening
  // or closing a panel does not replay every card and its inline controls.
  const boardHandlers = useMemo(() => ({
    onOpenIssue: panel.openIssue,
    onOpenIssueById: panel.openIssueById,
    onOpenPlan: panel.openPlan,
    onUpdateIssue: updateIssue,
    onSetCategories: setCategories,
    onDeleteIssue: deleteIssue,
    onAskNumo: (selectedIssues: Issue[]) => openIntent({
      source: selectedIssues.length > 1 ? "bulk" : "issue",
      action: "discuss",
      projectId: null,
      pageContext: issuesPageContext(selectedIssues, (issue) => {
        const project = projectMap.get(issue.project_id);
        return project ? issueIdentifier(project.key, issue.number) : String(issue.number);
      }),
    }),
    onMove: moveIssue,
  }), [panel.openIssue, panel.openIssueById, panel.openPlan, updateIssue, setCategories, deleteIssue, openIntent, projectMap, moveIssue]);
  const handleCreateIssue = useCallback(
    (status: IssueStatus) => openCreateIssue({ status }),
    [openCreateIssue],
  );

  // The board paints from its open columns (lib/global-board-reads.ts). What
  // reads the other statuses waits for them rather than show them empty: a
  // view with such a column, the cycle, and the "no tickets yet" screen.
  const awaitingDeferred = deferredPending && (cycleMode || scopedIssues.length === 0 ||
    statuses.some((status) => isDeferredBoardStatus(status.value)));

  if (loading || awaitingDeferred || viewsLoading || projectsLoading) {
    return (
      <BoardLoadingSkeleton
        position={boardScrollPosition}
        specialView={cycleMode}
        showCreateIssue={!cycleMode}
      />
    );
  }

  /**
   * Nothing to show ANYWHERE — not "nothing in this view". No project, or no
   * issue in any of them: the toolbar (views, filters, sort) has nothing to
   * act on, and the screen comes down to what there is to do. Cycle mode has
   * its own empty screens.
   */
  const nothingAnywhere = !cycleMode && (projects.length === 0 || scopedIssues.length === 0);

  return (
    // A pointer over the board precedes the first card click: the panel's
    // code starts loading then, if the idle warm-up has not yet.
    <div className="flex h-full flex-col" onPointerEnter={panel.onPointerEnter}>
      {/* The view's name for headings navigation (WCAG 1.3.1, 2.4.6). */}
      <h1 className="sr-only">{tMeta("all")}</h1>
      {/* Nothing anywhere: no toolbar above a screen with one thing to offer. */}
      {!nothingAnywhere && (
        <BoardToolbar
          tabOrderScope="global"
          viewHref={(view) =>
            boardViewTabHref(pathname, searchParams, view ?? "cycle")
          }
          views={views}
          activeViewId={cycleMode ? null : activeViewId}
          generatingViewIds={generatingViewIds}
          onSelectView={(id) => {
            if (cycleMode) switchCycleMode(false);
            selectView(id);
          }}
          config={config}
          onConfigChange={setConfig}
          members={unionMembers}
          categories={allCategories}
          objectives={allObjectives}
          integrations={allIntegrations}
          projects={listedProjects}
          groupFacetsByName
          dirty={cycleMode ? false : dirty}
          onCreateView={handleCreateView}
          onUpdateActiveView={saveActiveView}
          onRenameView={renameView}
          onDeleteView={deleteView}
          withNumo
          withShare={false}
          onAskAI={handleAskAI}
          // No Cycle tab while cycles are off; `?view=cycle` still reaches
          // their activation screen.
          cycleTab={cyclesEnabled ? {
            active: cycleMode,
            completionPercent: currentCycleCompletionPercent,
            onSelect: () => switchCycleMode(true),
          } : undefined}
          rightControls={
            cycleMode ? (
              cyclesEnabled && selectedCycle ? (
                <div className="flex items-center gap-1.5">
                  <CycleControls
                    cycles={cycles}
                    cycle={selectedCycle}
                    selectedId={selectedCycleId}
                    onSelect={setSelectedCycleId}
                    filledPoints={cycleFilledPoints(cycleIssues)}
                    completionPercent={cycleCompletionPercent(cycleIssues)}
                  />
                  <StatusFilterMenu
                    status={cycleStatusFilter}
                    onChange={(next) => setCycleStatusFilter(next ?? null)}
                  />
                </div>
              ) : (
                <span aria-hidden />
              )
            ) : undefined
          }
        />
      )}

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
          <div className="flex min-h-0 flex-1 flex-col pt-3">
            {selectedPhase === "current" && cycleFullyCompleted && (
              <div className="px-6 pb-3">
                <CycleCompletedBanner />
              </div>
            )}
            <div className="min-h-0 flex-1">
              <KanbanBoard
                issues={cycleBoardIssues}
                statuses={cycleStatuses}
                sort="manual"
                comparator={cycleComparator}
                readOnly={selectedPhase !== "current"}
                buildMenuActions={
                  selectedPhase === "current" ? buildCycleMenuActions : undefined
                }
                onAddRelation={
                  selectedPhase === "current" ? addRelation : undefined
                }
                onRemoveRelation={
                  selectedPhase === "current" ? removeRelation : undefined
                }
                // Cycle view: no cycle badge (every card is in it), but a
                // selection can leave the cycle at once — only the current
                // cycle, since leaving a past one makes no sense.
                bulkCycleId={
                  selectedPhase === "current" ? (selectedCycle?.id ?? null) : null
                }
                onSetCycle={
                  selectedPhase === "current" ? onSetIssueCycle : undefined
                }
                projects={boardProjects}
                allIssues={scopedIssues}
                relations={relations}
                {...boardHandlers}
                horizontalScroll={boardScrollPosition}
              />
            </div>
          </div>
        )
      ) : nothingAnywhere ? (
        /* Empty FOR GOOD, not "empty in this view": either no project — the
           only thing to do is create one — or projects without a single
           issue, the same screen as on a project board. The issue is created
           from the shared dialog, which asks WHICH project. */
        <PageScroll className="px-6 py-8">
          <div className="mx-auto max-w-content">
            {projects.length === 0 ? (
              <EmptyScene icon={FolderAddIcon} title={t("emptyNoProject")}>
                <Button onClick={openCreateProject}>
                  <HugeiconsIcon icon={Add01Icon} />
                  {tProjects("firstProject")}
                </Button>
              </EmptyScene>
            ) : (
              <EmptyScene icon={BOARD_ICON} title={tBoard("emptyTitle")}>
                <Button onClick={() => openCreateIssue()}>
                  <HugeiconsIcon icon={Add01Icon} />
                  {tBoard("newIssue")}
                  <Kbd
                    size="sm"
                    className="ml-1 border-transparent bg-primary-foreground/15 text-primary-foreground"
                  >
                    C
                  </Kbd>
                </Button>
              </EmptyScene>
            )}
          </div>
        </PageScroll>
      ) : (
        /* No issue passes the filters: the board stays up with empty
           columns. "Empty in this view" is a filter setting, not a dead end,
           as on a project board. */
        <div className="min-h-0 flex-1 pt-3">
          <KanbanBoard
            issues={filtered}
            statuses={statuses}
            sort={config.sort}
            sortDirection={config.display.sortDirection}
            projects={boardProjects}
            buildMenuActions={buildCycleMenuActions}
            currentCycleId={cycles?.enabled ? (cycles.current?.id ?? null) : null}
            onSetCycle={onSetIssueCycle}
            onCreateIssue={handleCreateIssue}
            onAddRelation={addRelation}
            onRemoveRelation={removeRelation}
            allIssues={scopedIssues}
            relations={relations}
            {...boardHandlers}
            horizontalScroll={boardScrollPosition}
          />
        </div>
      )}

      {panel.mounted && <IssueSidePanel
        issue={openIssue}
        open={!!openIssue}
        onOpenChange={panel.onOpenChange}
        onOpenIssue={panel.openIssueById}
        boardData={panelBoardData}
        initialTab={panel.tab}
      />}
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
      <AppTabRouteBoundary><GlobalBoardInner /></AppTabRouteBoundary>
    </Suspense>
  );
}
