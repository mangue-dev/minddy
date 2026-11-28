"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Layout3ColumnIcon, FileUploadIcon } from "@hugeicons/core-free-icons";
import { resolveIssueRef } from "@/lib/app-urls";
import { expandParam } from "@/lib/ref-registry";
import { useGeneratingViews } from "@/lib/use-generating-views";
import { useOptionalAppTabSession } from "@/lib/app-tabs-context";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { AppTabRouteBoundary, useAppTabRoute } from "@/lib/app-tab-route-context";

import {
  Suspense,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { useAppNavigation, useAppRouter } from "@/lib/use-app-router";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { SplitButton } from "@/components/ui/split-button";
import { Kbd } from "@/components/ui/kbd";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useProjectLookup } from "@/lib/use-project-lookup";
import { ProjectUnavailable } from "@/components/project-unavailable";
import { useProjectCapabilities } from "@/lib/use-project-capabilities";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useIssueRelationsQuery } from "@/lib/use-issue-relations-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useObjectivesQuery, objectiveProgress } from "@/lib/use-objectives-query";
import { useIntegrationsQuery } from "@/lib/use-integrations-query";
import { boardIntegrationFacets } from "@/lib/board-integrations";
import { useMyCycleQuery } from "@/lib/use-my-cycle-query";
import { cycleCompletionPercent } from "@/lib/cycle";
import { useBoardViews } from "@/lib/use-board-views";
import { useBoardScreen } from "@/lib/use-board-screen";
import { usePublishCurrentView } from "@/lib/current-view-context";
import { buildViewHref } from "@/lib/view-href";
import { boardViewTabHref } from "@/lib/board-view-tab";
import { ME_ASSIGNEE, filterIssues, visibleStatuses } from "@/lib/view-filter";
import { issueIdentifier, type IssueStatus } from "@/lib/issue-constants";
import {
  useAssistantContext,
  useAssistantPanelActions,
} from "@/lib/assistant-panel-context";
import { issuesPageContext } from "@/lib/assistant-issue-context";
import { NumoIcon } from "@/components/numo-icon";
import { EmptyScene } from "@/components/empty-scene";
import { KanbanBoard } from "@/components/kanban-board";
import { singleProjectBoard } from "@/lib/board-projects";
import { BOARD_ICON } from "@/components/feature-icons";
import { BoardToolbar } from "@/components/board-toolbar";
import { useCycleMenuActions } from "@/components/cycle/use-cycle-menu-actions";
import { ObjectiveBoardHeader } from "@/components/objective-banner";
import { StatusFilterMenu } from "@/components/status-filter-menu";
import { useAppTabLocalState } from "@/lib/app-tab-local-state";
import { IssueFamilyBoardHeader } from "@/components/issue-family-banner";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { BoardLoadingSkeleton } from "@/components/board-loading-skeleton";
import { PageScroll } from "@/components/page-scroll";
// Deferred: the import wizard (and its papaparse CSV machinery) only runs from
// ?setup=import — a one-time gesture that must not tax every board navigation.
const ProjectImportDialog = dynamic(
  () =>
    import("@/components/project-seed/project-import-dialog").then(
      (m) => m.ProjectImportDialog
    ),
  { ssr: false }
);
const CreateIssueDialog = dynamic(
  () => loadCreateIssueDialog().then((m) => m.CreateIssueDialog),
  { ssr: false },
);
const ObjectivesBoardSidebar = dynamic(
  () => import("@/components/objectives/objectives-page").then((m) => m.ObjectivesBoardSidebar),
  { ssr: false },
);
const IssueSidePanel = dynamic(
  () => loadIssueSidePanel().then((m) => m.IssueSidePanel),
  { ssr: false },
);
import { takeSeedHandoff } from "@/lib/project-seed-handoff";
import { afterFirstContentIdle } from "@/lib/first-content";
import {
  familyBoardStatuses,
  issueFamilyBoardExitHref,
  issueFamilyBoardHref,
  issueFamilyParentId,
  issueParentIds,
  resolveIssueFamily,
} from "@/lib/issue-family-board";
import {
  loadCreateIssueDialog,
  loadIssueSidePanel,
  preloadSurface,
} from "@/lib/lazy-app-surfaces";
import type { Issue } from "@/lib/types";

function ProjectBoard() {
  const t = useTranslations("Board");
  const tFamily = useTranslations("IssueFamily");
  const tSeed = useTranslations("Seed");
  const tProjects = useTranslations("Projects");
  const { pathname, searchParams, projectId: routeProjectId } = useAppTabRoute();
  const projectId = routeProjectId!;
  const router = useAppRouter();
  const openDestination = useAppNavigation();
  // Record parameters carry short codes; they expand as their lists load.
  const objectiveParam = expandParam(searchParams.get("objective"));
  const familyParam = expandParam(searchParams.get("family"));
  const newParam = searchParams.get("new");
  const viewParam = expandParam(searchParams.get("view"));
  const setupParam = searchParams.get("setup");
  const boardScrollPosition = useRef(0);

  const { projects } = useProjects();
  // "Project not found" only once a fresh list confirms it (MIN-937).
  const projectLookup = useProjectLookup(projectId);
  const { project } = projectLookup;

  const {
    issues,
    loading: issuesLoading,
    createIssue,
    updateIssue,
    deleteIssue,
    moveIssue,
    setIssueCycle,
    setCategories,
  } = useIssuesQuery(projectId);
  const { relations, addRelation, removeRelation } =
    useIssueRelationsQuery(projectId);
  // The route resolved its project under the viewer's RLS (projects/[id]/layout.tsx):
  // members are read with the issues, not after the project list (MIN-875).
  const { members } = useMembersQuery(projectId, true);
  const { categories } = useCategoriesQuery(projectId);
  const { objectives } = useObjectivesQuery(projectId);
  const { integrations } = useIntegrationsQuery(projectId);
  const projectKey = project?.key ?? "";
  const boardProjects = useMemo(
    () => singleProjectBoard({ id: projectId, key: projectKey }, members, categories, objectives),
    [projectId, projectKey, members, categories, objectives]
  );
  const { user } = useAuth();
  const myUserId = user?.id ?? null;
  // Import and seeding by Numo are the owner's (the API reserves them): the
  // empty board only offers what is actually within reach.
  const isOwner = !!project && project.owner_id === myUserId;
  // Project readers (MIN-693) browse the board without creating anything.
  const { canWrite } = useProjectCapabilities(projectId);
  const { open: openAssistant, openIntent } = useAssistantPanelActions();
  const appTabs = useOptionalAppTabSession();
  // No new tab on the phone (MIN-967): the family entry opens the board here.
  const mobile = useMobileLayout() === true;

  // Right-click "Add to cycle" (MIN-32) — the cycle is canonical on /all, but
  // picking work into your week from a project board must work too.
  const { currentCycle, nextCycle, cyclesEnabled } = useMyCycleQuery();
  const onSetIssueCycle = useCallback(
    (issue: Issue, cycleId: string | null) => void setIssueCycle(issue.id, cycleId),
    [setIssueCycle]
  );
  const buildCycleMenuActions = useCycleMenuActions(
    currentCycle?.id ?? null,
    nextCycle?.id ?? null,
    onSetIssueCycle
  );
  const familyParentIds = useMemo(() => issueParentIds(issues), [issues]);
  const buildFamilyMenuActions = useCallback(
    (issue: Issue): ContextMenuAction[] => {
      const parentId = issueFamilyParentId(issue, familyParentIds);
      if (!parentId) return [];
      const href = issueFamilyBoardHref(
        projectId,
        parentId,
        searchParams,
      );
      const openHere = () => openDestination(href, () => window.history.pushState(null, "", href));
      if (mobile) {
        return [
          {
            id: "issue-family-board",
            label: tFamily("openHere"),
            keywords: ["family", "parent", "children", "famille", "sous-ticket"],
            icon: <HugeiconsIcon icon={Layout3ColumnIcon} className="size-4" />,
            onSelect: openHere,
          },
        ];
      }
      return [
        {
          id: "issue-family-board",
          label: tFamily("menuLabel"),
          keywords: ["family", "parent", "children", "famille", "sous-ticket"],
          icon: <HugeiconsIcon icon={Layout3ColumnIcon} className="size-4" />,
          children: [
            {
              id: "issue-family-board-current",
              label: tFamily("openHere"),
              icon: <HugeiconsIcon icon={Layout3ColumnIcon} className="size-4" />,
              onSelect: openHere,
            },
            {
              id: "issue-family-board-new-tab",
              label: tFamily("openNewTab"),
              icon: <HugeiconsIcon icon={Layout3ColumnIcon} className="size-4" />,
              onSelect: () => {
                if (appTabs) void appTabs.create(href);
                else window.open(href, "_blank", "noopener,noreferrer");
              },
            },
          ],
        },
      ];
    },
    [appTabs, familyParentIds, projectId, searchParams, tFamily, openDestination, mobile],
  );
  const buildIssueMenuActions = useCallback(
    (issue: Issue): ContextMenuAction[] => [
      ...buildFamilyMenuActions(issue),
      ...buildCycleMenuActions(issue),
    ],
    [buildCycleMenuActions, buildFamilyMenuActions],
  );
  const currentCycleCompletionPercent = useMemo(() => {
    const currentCycleId = currentCycle?.id;
    if (!currentCycleId) return null;
    return cycleCompletionPercent(issues.filter((issue) => issue.cycle_id === currentCycleId)) ?? 0;
  }, [currentCycle?.id, issues]);

  // Strip the one-shot ?view= instruction once applied, keeping other params
  // (?issue= deep links survive the /my redirect).
  const consumeViewParam = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("view");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [searchParams, pathname, router]);

  const {
    views,
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
    { kind: "project", projectId },
    { viewParam, onViewParamConsumed: consumeViewParam }
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createMounted, setCreateMounted] = useState(false);
  const [createStatus, setCreateStatus] = useState<IssueStatus | undefined>(undefined);
  // The import start (MIN-171): `?setup=import` opens the import panel with
  // the CSV dropped in the wizard.
  const [importOpen, setImportOpen] = useState(false);
  const [importMounted, setImportMounted] = useState(false);
  // What the wizard collected one step earlier (brief pasted, CSV submitted).
  // Taken once: reopening it later leaves an empty surface.
  const [handoff, setHandoff] = useState<ReturnType<typeof takeSeedHandoff>>(null);
  // The handoff is TAKEN once: a replayed effect (StrictMode does it in dev)
  // would find it empty and erase the one just received. The ref keeps a copy
  // that replays read instead of the consumed handoff.
  const handoffTaken = useRef(false);
  const takenHandoff = useRef<ReturnType<typeof takeSeedHandoff>>(null);
  // Views Numo is currently building from a description (their chip shows a
  // spinner). Maps view id → the view's updated_at when generation started;
  // cleared when the view's stored config changes (Numo applied filters) or
  // after a safety timeout.
  const { generatingViewIds, beginGenerating } = useGeneratingViews(views);

  // Idle after the first content (MIN-880): on a cold load the main thread
  // idles while the board's reads are in flight.
  useEffect(() => createMounted ? undefined : afterFirstContentIdle(() => {
    preloadSurface(loadCreateIssueDialog);
    startTransition(() => setCreateMounted(true));
  }, 3_000, 1_500), [createMounted]);

  useEffect(() => {
    if (importOpen) setImportMounted(true);
  }, [importOpen]);

  // Open the create dialog, optionally preset to a column's status.
  const openCreate = useCallback((status?: IssueStatus) => {
    setCreateStatus(status);
    setCreateMounted(true);
    setCreateOpen(true);
  }, []);

  const { panel, handleCreateView, handleAskAI } = useBoardScreen({
    projectId,
    activeView,
    createViewAndSelect,
    beginGenerating,
  });

  // Family mode takes precedence over the objective and saved-view filters.
  // Its URL keeps the current view so leaving the family restores it intact.
  const activeFamily = useMemo(
    () => resolveIssueFamily(issues, familyParam),
    [issues, familyParam],
  );
  const familyParent = activeFamily?.parent;
  const familySubIssueOf = useMemo(
    () => familyParent
      ? {
          id: familyParent.id,
          label: `${issueIdentifier(projectKey, familyParent.number)} ${familyParent.title}`,
        }
      : null,
    [familyParent, projectKey],
  );
  const activeObjective = !activeFamily && objectiveParam
    ? objectives.find((o) => o.id === objectiveParam) ?? null
    : null;

  const normalIssues = useMemo(
    () => filterIssues(issues, config, { myUserId }),
    [issues, config, myUserId]
  );
  const objectiveIssues = useMemo(
    () =>
      activeObjective
        ? issues.filter((i) => i.objective_id === activeObjective.id)
        : [],
    [issues, activeObjective]
  );

  // The objective and family boards have no saved view: their own status
  // filter (MIN-736) shows the open columns until Done or Canceled is chosen.
  const [scopedStatusFilter, setScopedStatusFilter] = useAppTabLocalState<
    IssueStatus[] | null
  >("project-scoped-board-status", null);
  const scopedStatuses = useMemo(
    () => familyBoardStatuses(scopedStatusFilter),
    [scopedStatusFilter],
  );
  const scopedStatusMenu = (
    <StatusFilterMenu
      status={scopedStatusFilter}
      onChange={(next) => setScopedStatusFilter(next ?? null)}
    />
  );
  const boardIssues = useMemo(() => {
    if (!activeFamily && !activeObjective) return normalIssues;
    const scoped = activeFamily ? activeFamily.issues : objectiveIssues;
    const shown = new Set(scopedStatuses.map((s) => s.value));
    return scoped.filter((i) => shown.has(i.status));
  }, [activeFamily, activeObjective, objectiveIssues, normalIssues, scopedStatuses]);
  const statuses = useMemo(
    () =>
      // Family mode renders the same kanban sweep as the objective page
      // (see familyBoardStatuses): no `triage`, no `duplicate` column —
      // members parked there stay on the full board.
      activeFamily || activeObjective
        ? scopedStatuses
        : visibleStatuses(config),
    [activeFamily, activeObjective, scopedStatuses, config],
  );
  // Objective mode no longer forces a manual order (MIN-510): it follows the
  // board's sort, with "smart" — the app-wide default — standing in for the
  // old manual default, whose positions mean nothing in this filtered scope.
  const sort =
    (activeFamily || activeObjective) && config.sort === "manual"
      ? "smart"
      : config.sort;
  const handleAskNumoForIssues = useCallback(
    (selectedIssues: Issue[]) => {
      if (!project) return;
      openIntent({
        source: selectedIssues.length > 1 ? "bulk" : "issue",
        action: "discuss",
        projectId: project.id,
        pageContext: {
          projectId: project.id,
          ...issuesPageContext(selectedIssues, (issue) =>
            issueIdentifier(project.key, issue.number),
          ),
        },
      });
    },
    [openIntent, project],
  );
  // A deep link names the issue `MIN-42` or by short code; panels set its id.
  const openIssue = panel.openIssueRef
    ? resolveIssueRef(panel.openIssueRef, issues) ?? null
    : null;

  // The active view of a board lives in localStorage, not in the address —
  // without this publication, a restored app tab would reopen the board on the
  // currently stored view, not on the one we were looking at. `?view=` is
  // precisely the instruction that restores it (see useBoardViews). The issue
  // open in the side panel is an overlay and stays out of the address.
  usePublishCurrentView(
    activeView && project
      ? {
          href: buildViewHref(pathname, searchParams.toString(), {
            view: activeView.id,
          }),
        }
      : null
  );

  // Publish what this board is showing to Numo (open issue > family parent >
  // objective > tab), so "this ticket" / "this objective" / "this view" resolve
  // without searching. A family board is scoped to one parent ticket: that
  // ticket becomes THE ambient context — "this ticket" must mean it — and the
  // board view underneath stays out of the way, as with an objective scope.
  // The selected view rides along in every case so Numo can edit it in place.
  const viewCtx = !activeObjective && activeView
    ? { viewId: activeView.id, viewName: activeView.name }
    : null;
  const familyCtx = activeFamily
    ? {
        issueId: activeFamily.parent.id,
        issueIdentifier: issueIdentifier(
          project?.key ?? "",
          activeFamily.parent.number,
        ),
        issueTitle: activeFamily.parent.title,
      }
    : null;
  useAssistantContext(
    project
      ? openIssue
        ? {
            projectId,
            issueId: openIssue.id,
            issueIdentifier: issueIdentifier(project.key, openIssue.number),
            issueTitle: openIssue.title,
            ...viewCtx,
          }
        : familyCtx
        ? { projectId, ...familyCtx }
        : activeObjective
          ? {
              projectId,
              objectiveId: activeObjective.id,
              objectiveName: activeObjective.name,
              objectiveColor: activeObjective.color,
              objectiveStatus: activeObjective.status,
            }
          : { projectId, ...viewCtx }
      : null
  );

  // Header "Nouveau → Nouvelle issue": /projects/[id]?new=issue opens the dialog.
  useEffect(() => {
    if (newParam === "issue") {
      setCreateStatus(undefined);
      setCreateMounted(true);
      setCreateOpen(true);
      router.replace(pathname);
    }
  }, [newParam, pathname, router]);

  // End of the creation wizard: /projects/[id]?setup=numo|import opens the
  // starting point the user chose (MIN-171). The URL only carries the choice;
  // what was entered travels in memory (project-seed-handoff), since a `File`
  // does not serialize. Single-use, like `?new=`: closing it must not reopen
  // it on the next render.
  useEffect(() => {
    if (setupParam !== "import" && setupParam !== "numo") return;
    // The first message NAMES the project, so wait until it is known.
    if (setupParam === "numo" && !project) return;
    if (!handoffTaken.current) {
      handoffTaken.current = true;
      takenHandoff.current = takeSeedHandoff();
      setHandoff(takenHandoff.current);
    }
    if (setupParam === "numo") {
      // A pasted brief (MIN-173) OPENS THE CONVERSATION — the same screen as
      // "Talk it through with Numo", only the first message differs: without a
      // brief Numo starts with questions, with one it starts from the text,
      // and both can go back and forth before a single issue exists.
      const taken = takenHandoff.current;
      const brief = taken?.kind === "numo" ? taken.brief?.trim() : null;
      openAssistant({
        projectId,
        prompt: brief
          ? tProjects("wizardSeedBriefPrompt", { name: project!.name, brief })
          : tProjects("wizardSeedNumoPrompt", { name: project!.name }),
      });
    } else {
      setImportOpen(true);
    }
    router.replace(pathname);
  }, [
    setupParam,
    pathname,
    router,
    project,
    projectId,
    openAssistant,
    tProjects,
  ]);

  // `C` (new issue) is an app-wide shortcut now (see CreateProvider). The column
  // "+" still opens this local dialog with its status/objective/assignee presets.

  if (!project) {
    if (projectLookup.state === "loading") {
      return (
        <div className="px-6 py-10">
          <Skeleton className="h-8 w-64" />
        </div>
      );
    }
    return <ProjectUnavailable lookup={projectLookup} />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* The view's name for headings navigation (WCAG 1.3.1, 2.4.6): the
          breadcrumb above shows it, but outside <main>. */}
      <h1 className="sr-only">
        {activeFamily ? activeFamily.parent.title : activeObjective ? activeObjective.name : project.name}
      </h1>
      {/* An objective's board stays in the objectives list: its bar takes
          the sidebar's place, with this objective highlighted. */}
      {objectiveParam && !activeFamily ? (
        <ObjectivesBoardSidebar projectId={projectId} objectiveId={objectiveParam} />
      ) : null}
      {issuesLoading ? (
        <BoardLoadingSkeleton position={boardScrollPosition} />
      ) : issues.length === 0 ? (
        /* Empty board: the THREE ways to fill it, most frequent first — an
           issue in hand (the shortcut shows where it is used), the import of
           an existing backlog, the conversation with Numo. Import and seeding
           stay with the owner: the API reserves them, and the owner pays for
           the call. */
        <PageScroll className="px-6 py-8">
          <div className="mx-auto max-w-content">
            <EmptyScene icon={BOARD_ICON} title={t("emptyTitle")}>
              {isOwner ? (
                <SplitButton
                  onClick={() => openCreate()}
                  menuLabel={t("emptyMoreWays")}
                  menu={
                    <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                      <HugeiconsIcon icon={FileUploadIcon} />
                      {t("emptyImport")}
                    </DropdownMenuItem>
                  }
                >
                  <HugeiconsIcon icon={Add01Icon} />
                  {t("newIssue")}
                  <Kbd
                    size="sm"
                    className="ml-1 border-transparent bg-primary-foreground/15 text-primary-foreground"
                  >
                    C
                  </Kbd>
                </SplitButton>
              ) : canWrite ? (
                <Button type="button" onClick={() => openCreate()}>
                  <HugeiconsIcon icon={Add01Icon} />
                  {t("newIssue")}
                </Button>
              ) : null}
              {isOwner && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    openAssistant({
                      projectId,
                      prompt: tProjects("wizardSeedNumoPrompt", {
                        name: project.name,
                      }),
                    })
                  }
                >
                  <NumoIcon state="idle" className="size-4" />
                  {tSeed("emptyBoardCta")}
                </Button>
              )}
            </EmptyScene>
          </div>
        </PageScroll>
      ) : (
        <>
          {activeFamily ? (
            <IssueFamilyBoardHeader
              parent={activeFamily.parent}
              projectKey={project.key}
              childCount={activeFamily.issues.length - 1}
              // Same grading as the objective and cycle rings: effort-weighted
              // with partial credit for work in flight, not a raw closed count.
              percent={
                cycleCompletionPercent(
                  activeFamily.issues.slice(1).map((issue) => ({
                    effort: issue.effort,
                    status: issue.status,
                  }))
                ) ?? 0
              }
              exitHref={issueFamilyBoardExitHref(projectId, searchParams)}
              actions={scopedStatusMenu}
            />
          ) : activeObjective ? (
            <ObjectiveBoardHeader
              objective={activeObjective}
              objectives={objectives}
              projectId={project.id}
              projectKey={project.key}
              issues={issues}
              onOpenIssue={panel.openIssueById}
              progress={objectiveProgress(activeObjective.id, issues)}
              lead={
                activeObjective.lead_user_id
                  ? members.find((m) => m.user_id === activeObjective.lead_user_id) ??
                    null
                  : null
              }
              actions={scopedStatusMenu}
            />
          ) : (
            <BoardToolbar
              tabOrderScope={project.id}
              viewHref={(view) =>
                view
                  ? boardViewTabHref(pathname, searchParams, view)
                  : boardViewTabHref("/all", "", "cycle")
              }
              views={views}
              activeViewId={activeViewId}
              generatingViewIds={generatingViewIds}
              onSelectView={selectView}
              config={config}
              onConfigChange={setConfig}
              members={members}
              categories={categories}
              objectives={objectives}
              integrations={boardIntegrationFacets(integrations, issues)}
              dirty={dirty}
              onCreateView={handleCreateView}
              onUpdateActiveView={saveActiveView}
              onRenameView={renameView}
              onDeleteView={deleteView}
              onAskAI={handleAskAI}
              // Readers (MIN-693) cannot publish or revoke view links.
              withShare={canWrite}
              // The cycle is personal & cross-project: the tab exists on every
              // board but is canonical on /all only — here it just links out
              // (↗), it never scopes the cycle to this project (MIN-32).
              // Hidden while the account has cycles off.
              cycleTab={cyclesEnabled ? {
                active: false,
                external: true,
                completionPercent: currentCycleCompletionPercent,
                onSelect: () => router.push("/all?view=cycle"),
              } : undefined}
            />
          )}
          <div className="min-h-0 flex-1 pt-3">
            <KanbanBoard
              issues={boardIssues}
              allIssues={issues}
              relations={relations}
              statuses={statuses}
              sort={sort}
              sortDirection={config.display.sortDirection}
              buildMenuActions={buildIssueMenuActions}
              currentCycleId={currentCycle?.id ?? null}
              onSetCycle={onSetIssueCycle}
              projects={boardProjects}
              onOpenIssue={panel.openIssue}
              onOpenIssueById={panel.openIssueById}
              onAddRelation={addRelation}
              onRemoveRelation={removeRelation}
              onOpenPlan={panel.openPlan}
              // Project readers (MIN-693) create nothing.
              onCreateIssue={canWrite ? openCreate : undefined}
              onAskNumo={handleAskNumoForIssues}
              onUpdateIssue={updateIssue}
              onSetCategories={setCategories}
              onDeleteIssue={deleteIssue}
              onMove={moveIssue}
              horizontalScroll={boardScrollPosition}
            />
          </div>
        </>
      )}

      {createMounted ? (
        <CreateIssueDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          projectId={projectId}
          projects={projects}
          members={members}
          categories={categories}
          objectives={objectives}
          onCreate={createIssue}
          initialStatus={createStatus}
          // Family mode: a new issue created from this scoped board lands IN
          // the family — without the preset it would be born top-level and
          // instantly vanish from the board it was created on. The relation
          // is visible in the form, where it can be removed.
          initialSubIssueOf={familySubIssueOf}
          // The project board opens its own dialog (column presets) —
          // distinguished from the global dialog in the stats.
          analyticsSource={activeObjective ? "objective" : "board"}
          initialObjectiveId={activeObjective?.id ?? null}
          initialAssigneeId={
            // On an assigned-to-me board, a new unassigned issue would instantly
            // vanish — pre-assign it to the creator.
            !activeObjective && config.filters.assignee?.includes(ME_ASSIGNEE)
              ? myUserId
              : null
          }
        />
      ) : null}

      {panel.mounted ? (
        <IssueSidePanel
          issue={openIssue}
          open={!!openIssue}
          onOpenChange={panel.onOpenChange}
          onOpenIssue={panel.openIssueById}
          initialTab={panel.tab}
        />
      ) : null}

      {importMounted ? (
        <ProjectImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          projectId={projectId}
          initialFile={handoff?.kind === "import" ? handoff.file : null}
        />
      ) : null}
    </div>
  );
}

export default function ProjectPage() {
  return (
    <Suspense fallback={<div className="px-6 py-10"><Skeleton className="h-8 w-64" /></div>}>
      <AppTabRouteBoundary><ProjectBoard /></AppTabRouteBoundary>
    </Suspense>
  );
}
