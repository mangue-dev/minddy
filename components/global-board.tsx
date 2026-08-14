"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Button, Skeleton, toast } from "mangue-ui";
import { Kbd } from "@/components/ui/kbd";
import { FolderPlus, LayoutGrid, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useCreate } from "@/lib/create-context";
import { useGlobalBoardQuery } from "@/lib/use-global-board-query";
import { useBoardViews } from "@/lib/use-board-views";
import { usePublishCurrentView } from "@/lib/current-view-context";
import { buildViewHref } from "@/lib/saved-view-href";
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
import { issuesPageContext } from "@/lib/assistant-issue-context";
import { EmptyScene } from "@/components/empty-scene";
import { GlobalKanbanBoard } from "@/components/global-kanban-board";
import { BoardToolbar } from "@/components/board-toolbar";
import { IssueSidePanel } from "@/components/issue-side-panel";
import {
  CycleAskNumo,
  CycleControls,
  CycleTitleSelector,
  formatCycleRange,
} from "@/components/cycle/cycle-header";
import {
  CycleActivationWelcome,
  CycleCompletedBanner,
  CycleEmptyNotice,
  CycleFutureNotice,
} from "@/components/cycle/cycle-empty-states";
import { useCycleMenuActions } from "@/components/cycle/use-cycle-menu-actions";
import type {
  Category,
  Issue,
  IssueRelationType,
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

/** How long a view keeps its "Numo is filling me in" spinner before the safety
    timeout clears it (mirrors the project board). */
const NUMO_GENERATION_TIMEOUT_MS = 120_000;

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
  const tProjects = useTranslations("Projects");
  const format = useFormatter();
  const { user } = useAuth();
  const myUserId = user?.id ?? null;
  const { projects, openCreateProject, loading: projectsLoading } = useProjects();
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
  // Deep-link (e.g. the home cycle preview, MIN-67): /all?issue=<id> opens
  // that issue's side panel once the board's data has loaded.
  const issueParam = searchParams.get("issue");
  const {
    issues,
    membersByProject,
    categoriesByProject,
    objectivesByProject,
    integrationsByProject,
    relations,
    cycles,
    loading,
    updateIssue,
    moveIssue,
    setCategories,
    deleteIssue,
    createIssue,
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
      return;
    }
    // `?view=<id>` désigne une VUE, donc pas le cycle — et le mode cycle, lui,
    // est mémorisé (localStorage). Sans cette sortie, une vue enregistrée
    // ouverte alors que le cycle était en mémoire sélectionnait bien la vue
    // dessous, mais affichait le cycle par-dessus : le raccourci n'emmenait pas
    // là où il disait. C'est le même geste que le clic sur une pastille de vue
    // dans la barre d'outils, qui quitte le cycle avant de sélectionner.
    if (rawViewParam) switchCycleMode(false);
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

  // Views Numo is currently filling in (id → the updated_at at hand-off). Same
  // mechanism as the project board: the pill spins until Numo bumps the view's
  // updated_at (realtime) or the safety timeout fires.
  const [generatingViews, setGeneratingViews] = useState<Record<string, string>>(
    {}
  );
  const genTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const generatingViewIds = useMemo(
    () => new Set(Object.keys(generatingViews)),
    [generatingViews]
  );

  const handleCreateView = async (name: string, description?: string) => {
    const view = await createViewAndSelect(name);
    const wish = description?.trim();
    if (wish) {
      // Hand the fresh GLOBAL view to Numo (global mode, projectId null): its id
      // rides along in pageContext so Numo edits this exact view; the board
      // adopts the new filters live once realtime brings the row back.
      setGeneratingViews((prev) => ({ ...prev, [view.id]: view.updated_at }));
      const timer = setTimeout(() => {
        setGeneratingViews((prev) => {
          if (!(view.id in prev)) return prev;
          const next = { ...prev };
          delete next[view.id];
          return next;
        });
        genTimers.current.delete(view.id);
      }, NUMO_GENERATION_TIMEOUT_MS);
      genTimers.current.set(view.id, timer);
      openAssistant({
        projectId: null,
        prompt: tBoard("numoBuildViewPrompt", { name, description: wish }),
        pageContext: { viewId: view.id, viewName: name },
      });
    } else {
      toast.success(tBoard("viewCreated", { name }));
    }
  };

  // Let Numo shape the currently selected global view: open the chat in global
  // mode carrying the active view as context so "cette vue" resolves.
  const handleAskNumo = () => {
    openAssistant({
      projectId: null,
      pageContext: activeView
        ? { viewId: activeView.id, viewName: activeView.name }
        : undefined,
    });
  };

  // Clear a view's spinner once Numo touched it (updated_at bumped) or it's gone.
  useEffect(() => {
    setGeneratingViews((prev) => {
      const ids = Object.keys(prev);
      if (ids.length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const id of ids) {
        const v = views.find((x) => x.id === id);
        if (!v || v.updated_at !== prev[id]) {
          delete next[id];
          changed = true;
          const timer = genTimers.current.get(id);
          if (timer) clearTimeout(timer);
          genTimers.current.delete(id);
        }
      }
      return changed ? next : prev;
    });
  }, [views]);

  // Drop any pending generation timers on unmount.
  useEffect(() => {
    const timers = genTimers.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const [openIssueTab, setOpenIssueTab] = useState<"description" | "plan">(
    "description"
  );

  // Deep-link from the home cycle preview: /all?issue=<id> (with ?view=cycle
  // consumed above into cycleMode) opens that issue's side panel.
  useEffect(() => {
    if (issueParam) {
      setOpenIssueId(issueParam);
      setOpenIssueTab("description");
    }
  }, [issueParam]);

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

  // Flat cross-project facet lists. Each is every project's entities concatenated
  // — the toolbar's `groupFacetsByName` then collapses same-named rows (e.g. a
  // "Bug" category in several projects) into one that filters all their ids.
  const allCategories = useMemo(
    () => Object.values(categoriesByProject).flat(),
    [categoriesByProject]
  );
  const allObjectives = useMemo(
    () => Object.values(objectivesByProject).flat(),
    [objectivesByProject]
  );
  const allIntegrations = useMemo(
    () => Object.values(integrationsByProject).flat(),
    [integrationsByProject]
  );

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
  // Every issue of the cycle closed → the "completed" banner offers a refill.
  const cycleFullyCompleted =
    cycleIssues.length > 0 &&
    cycleIssues.every((i) => ["done", "canceled", "duplicate"].includes(i.status));

  // « Enregistrer la vue actuelle » (⌘K) : le mode cycle et la vue active sont
  // deux états gardés hors de l'adresse (localStorage), et `?view=` les
  // rétablit tous les deux — "cycle" est l'instruction que cette page consomme
  // en mode cycle, un id de vue sinon.
  usePublishCurrentView({
    href: buildViewHref(pathname, searchParams.toString(), {
      view: cycleMode ? "cycle" : activeViewId,
    }),
    label: cycleMode ? tBoard("cycleTab") : (activeView?.name ?? t("allTitle")),
  });

  // Numo rides along: the cycle while it's on screen ("remplis mon cycle"),
  // otherwise the active global view so "cette vue" resolves to it.
  useAssistantContext(
    cycleMode && selectedCycle && cycleLabel
      ? { cycleId: selectedCycle.id, cycleLabel }
      : !cycleMode && activeView
        ? { viewId: activeView.id, viewName: activeView.name }
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

  // Relations (MIN-25) from any card of this board — the write goes through
  // the card's own project route (relations are same-project by construction).
  const handleAddRelation = useCallback(
    (sourceId: string, type: IssueRelationType, targetId: string, projectId: string) =>
      void addRelation(projectId, sourceId, type, targetId).catch((err) =>
        toast.error((err as Error).message)
      ),
    [addRelation]
  );

  const openIssue = openIssueId
    ? scopedIssues.find((i) => i.id === openIssueId) ?? null
    : null;
  const openPid = openIssue?.project_id ?? "";
  const openProject = openIssue ? projectMap.get(openPid) : undefined;

  if (loading || viewsLoading || projectsLoading) {
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
    onOpenIssueById: (id: string) => {
      setOpenIssueId(id);
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
    onDeleteIssue: (id: string, pid: string) => deleteIssue(id, pid),
    onAskNumo: (selectedIssues: Issue[]) => openAssistant({
      projectId: null,
      pageContext: issuesPageContext(selectedIssues, (issue) => {
        const project = projectMap.get(issue.project_id);
        return project ? `${project.key}-${issue.number}` : String(issue.number);
      }),
    }),
    onMove: moveIssue,
    allIssues: scopedIssues,
    relations,
  };

  /**
   * Rien à montrer NULLE PART — pas « rien dans cette vue ». Aucun projet, ou
   * aucun ticket dans aucun d'eux : la barre d'outils (vues, filtres, tri) n'a
   * alors rien sur quoi mordre, et l'écran se réduit à ce qu'il y a à faire.
   * Hors mode cycle, qui a déjà ses propres écrans d'attente.
   */
  const nothingAnywhere = !cycleMode && (projects.length === 0 || issues.length === 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-3 px-6 pt-4">
        {/* Le titre de la page saute dans le seul cas où il n'y a rien du tout :
            l'écran se réduit alors à ce qu'il y a à faire. */}
        {cycleMode && cycles?.enabled && selectedCycle ? (
          // Title line: date-selector left, Ask Numo right — the gauges live
          // on the pills row below.
          <div className="flex items-center justify-between gap-3">
            <CycleTitleSelector
              cycles={cycles}
              selectedId={selectedCycleId}
              onSelect={setSelectedCycleId}
            />
            <CycleAskNumo onAskNumo={askNumoAboutCycle} />
          </div>
        ) : nothingAnywhere ? null : (
          <h1 className="font-display text-lg font-semibold tracking-tight">
            {cycleMode ? tBoard("cycleTab") : t("allTitle")}
          </h1>
        )}
        {/* Rien nulle part : pas de barre d'outils au-dessus d'un écran qui
            n'a qu'une chose à proposer. */}
        {!nothingAnywhere && (
          <BoardToolbar
            tabOrderScope="global"
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
            projects={projects}
            groupFacetsByName
            dirty={cycleMode ? false : dirty}
            onCreateView={handleCreateView}
            onUpdateActiveView={saveActiveView}
            onRenameView={renameView}
            onDeleteView={deleteView}
            withNumo
            withShare={false}
            onAskNumo={handleAskNumo}
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
                  />
                ) : (
                  <span aria-hidden />
                )
              ) : undefined
            }
          />
        )}
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
          <div className="flex min-h-0 flex-1 flex-col pt-3">
            {selectedPhase === "current" && cycleFullyCompleted && (
              <div className="px-6 pb-3">
                <CycleCompletedBanner />
              </div>
            )}
            <div className="min-h-0 flex-1">
              <GlobalKanbanBoard
                issues={cycleIssues}
                statuses={STATUSES}
                sort="manual"
                comparator={cycleComparator}
                readOnly={selectedPhase !== "current"}
                buildMenuActions={
                  selectedPhase === "current" ? buildCycleMenuActions : undefined
                }
                onAddRelation={
                  selectedPhase === "current" ? handleAddRelation : undefined
                }
                // Vue cycle : pas de pastille (tout y est), mais une sélection
                // doit pouvoir sortir du cycle d'un coup — seulement sur le
                // cycle en cours, sortir d'un cycle passé n'a pas de sens.
                bulkCycleId={
                  selectedPhase === "current" ? (selectedCycle?.id ?? null) : null
                }
                onSetCycle={
                  selectedPhase === "current" ? onSetIssueCycle : undefined
                }
                projectMap={projectMap}
                memberMapByProject={memberMapByProject}
                categoryMapByProject={categoryMapByProject}
                objectiveMapByProject={objectiveMapByProject}
                {...boardHandlers}
              />
            </div>
          </div>
        )
      ) : nothingAnywhere ? (
        /* Vide POUR DE BON, pas « vide dans cette vue » : soit il n'y a aucun
           projet — et alors la seule chose à faire est d'en créer un —, soit il
           y en a mais pas un seul ticket, et c'est le même écran que sur le
           board d'un projet. Le ticket se crée depuis le dialog partagé, qui
           demande dans QUEL projet : ici, aucun n'est sous les yeux. */
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-5xl">
            {projects.length === 0 ? (
              <EmptyScene icon={FolderPlus} title={t("emptyNoProject")}>
                <Button onClick={openCreateProject}>
                  <Plus />
                  {tProjects("firstProject")}
                </Button>
              </EmptyScene>
            ) : (
              <EmptyScene icon={LayoutGrid} title={tBoard("emptyTitle")}>
                <Button onClick={() => openCreateIssue()}>
                  <Plus />
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
        </div>
      ) : (
        /* Aucun ticket ne passe les filtres : le board reste debout, colonnes
           vides. « Vide dans cette vue » n'est pas une impasse — c'est un
           réglage de filtre, et l'écran qui le montre est le board lui-même.
           Même geste que sur le board d'un projet. */
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
            onSetCycle={onSetIssueCycle}
            onCreateIssue={(status) => openCreateIssue({ status })}
            onAddRelation={handleAddRelation}
            {...boardHandlers}
          />
        </div>
      )}

      <IssueSidePanel
        issue={openIssue}
        open={!!openIssue}
        onOpenChange={(next) => {
          if (!next) {
            setOpenIssueId(null);
            // Strip the deep-link param so re-opening the same issue works.
            if (issueParam) router.replace(pathname);
          }
        }}
        projectKey={openProject?.key ?? ""}
        members={openIssue ? membersByProject[openPid] ?? [] : []}
        categories={openIssue ? categoriesByProject[openPid] ?? [] : []}
        objectives={openIssue ? objectivesByProject[openPid] ?? [] : []}
        allIssues={openIssue ? issuesByProject.get(openPid) ?? [] : []}
        relations={relations}
        onUpdate={(id, patch) => updateIssue(id, patch, openPid)}
        onDelete={(id) => deleteIssue(id, openPid)}
        onSetCategories={(id, ids) => setCategories(id, ids, openPid)}
        onCreate={(input) => createIssue(openPid, input)}
        onOpenIssue={(id) => {
          setOpenIssueId(id);
          setOpenIssueTab("description");
        }}
        onAddRelation={(sourceId, type, targetId) =>
          handleAddRelation(sourceId, type, targetId, openPid)
        }
        onRemoveRelation={(relationId) =>
          void removeRelation(openPid, relationId).catch((err) =>
            toast.error((err as Error).message)
          )
        }
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
