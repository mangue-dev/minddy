"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import Link from "next/link";
import {
  Button,
  DropdownMenuItem,
  Skeleton,
  SplitButton,
  toast,
} from "mangue-ui";
import { Kbd } from "@/components/ui/kbd";
import { FileUp, LayoutGrid, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useIssueRelationsQuery } from "@/lib/use-issue-relations-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useObjectivesQuery, objectiveProgress } from "@/lib/use-objectives-query";
import { useIntegrationsQuery } from "@/lib/use-integrations-query";
import { useMyCycleQuery } from "@/lib/use-my-cycle-query";
import { cycleCompletionPercent } from "@/lib/cycle";
import { useBoardViews } from "@/lib/use-board-views";
import { usePublishCurrentView } from "@/lib/current-view-context";
import { buildViewHref } from "@/lib/saved-view-href";
import { ME_ASSIGNEE, filterIssues, visibleStatuses } from "@/lib/view-filter";
import { STATUSES, issueIdentifier, type IssueStatus } from "@/lib/issue-constants";
import {
  useAssistantContext,
  useAssistantPanel,
} from "@/lib/assistant-panel-context";
import { issuesPageContext } from "@/lib/assistant-issue-context";
import { NumoIcon } from "@/components/numo-icon";
import { EmptyScene } from "@/components/empty-scene";
import { KanbanBoard } from "@/components/kanban-board";
import { BoardToolbar } from "@/components/board-toolbar";
import { useCycleMenuActions } from "@/components/cycle/use-cycle-menu-actions";
import { ObjectiveBanner } from "@/components/objective-banner";
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
  () => import("@/components/create-issue-dialog").then((m) => m.CreateIssueDialog),
  { ssr: false },
);
const IssueSidePanel = dynamic(
  () => import("@/components/issue-side-panel").then((m) => m.IssueSidePanel),
  { ssr: false },
);
import { takeSeedHandoff } from "@/lib/project-seed-handoff";
import { createIssueApi } from "@/lib/issues-api";
import {
  insertIssueEverywhere,
  issueWrites,
  mergeServerIssue,
  removeIssueEverywhere,
} from "@/lib/optimistic/issue-writes";
import { createIssueDeferred } from "@/lib/create-issue-deferred";
import { buildOptimisticIssue } from "@/lib/optimistic-issue";
import { useUndoHistory } from "@/lib/undo/undo-context";
import { snapshotIssue } from "@/lib/undo/undo-core";
import type {
  CreateIssueInput,
  Issue,
  IssueRelationType,
} from "@/lib/types";

function ProjectBoard() {
  const t = useTranslations("Board");
  const tSeed = useTranslations("Seed");
  const tProjects = useTranslations("Projects");
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const objectiveParam = searchParams.get("objective");
  const issueParam = searchParams.get("issue");
  const newParam = searchParams.get("new");
  const viewParam = searchParams.get("view");
  const setupParam = searchParams.get("setup");

  const { projects, loading: projectsLoading } = useProjects();
  const project = projects.find((p) => p.id === projectId);

  const {
    issues,
    loading: issuesLoading,
    createIssue,
    updateIssue,
    deleteIssue,
    moveIssue,
    setCategories,
  } = useIssuesQuery(projectId);
  const { relations, addRelation, removeRelation } =
    useIssueRelationsQuery(projectId);
  const { members } = useMembersQuery(projectId, !!project);
  const { categories } = useCategoriesQuery(projectId);
  const { objectives } = useObjectivesQuery(projectId);
  const { integrations } = useIntegrationsQuery(projectId);
  const { user } = useAuth();
  const myUserId = user?.id ?? null;
  // Import and priming by Numo are reserved for the owner (the API
  // reserve): the empty board only shows what is actually within range.
  const isOwner = !!project && project.owner_id === myUserId;
  const { open: openAssistant } = useAssistantPanel();

  // Right-click "Add to cycle" (MIN-32) — the cycle is canonical on /all, but
  // picking work into your week from a project board must work too. The patch
  // mirrors the server side-effect: adding assigns to me, never a status bump.
  const { currentCycle, nextCycle } = useMyCycleQuery();
  const onSetIssueCycle = useCallback(
    (issue: Issue, cycleId: string | null) =>
      void updateIssue(
        issue.id,
        cycleId && myUserId
          ? { cycle_id: cycleId, assignee_id: myUserId }
          : { cycle_id: cycleId }
      ).catch((err) => toast.error((err as Error).message)),
    [updateIssue, myUserId]
  );
  const buildCycleMenuActions = useCycleMenuActions(
    currentCycle?.id ?? null,
    nextCycle?.id ?? null,
    onSetIssueCycle
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
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const [sidePanelMounted, setSidePanelMounted] = useState(false);
  // Which tab the side panel shows when it (re)opens on an issue.
  const [openIssueTab, setOpenIssueTab] = useState<"description" | "plan">(
    "description"
  );
  // The import boot (MIN-171): `?setup=import` opens the import panel
  // with the CSV deposited in the wizard.
  const [importOpen, setImportOpen] = useState(false);
  const [importMounted, setImportMounted] = useState(false);
  // What the wizard collected one step earlier (brief pasted, CSV submitted).
  // Taken once: reopening it later leaves an empty surface.
  const [handoff, setHandoff] = useState<ReturnType<typeof takeSeedHandoff>>(null);
  // The reset is TAKEN, it is not replayed: a replayed effect (StrictMode in
  // dev does it systematically) would find it empty and delete the one we
  // just got. The ref therefore keeps a copy, which the replays reread
  // instead of a discount already consumed.
  const handoffTaken = useRef(false);
  const takenHandoff = useRef<ReturnType<typeof takeSeedHandoff>>(null);
  // Views Numo is currently building from a description (their chip shows a
  // spinner). Maps view id → the view's updated_at when generation started;
  // cleared when the view's stored config changes (Numo applied filters) or
  // after a safety timeout.
  const [generatingViews, setGeneratingViews] = useState<Record<string, string>>(
    {}
  );
  const genTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (createOpen) setCreateMounted(true);
  }, [createOpen]);

  useEffect(() => {
    if (openIssueId) setSidePanelMounted(true);
  }, [openIssueId]);

  useEffect(() => {
    if (importOpen) setImportMounted(true);
  }, [importOpen]);

  // Open the create dialog, optionally preset to a column's status.
  const openCreate = (status?: IssueStatus) => {
    setCreateStatus(status);
    setCreateOpen(true);
  };

  // Create in an arbitrary project (the create dialog's "create in another
  // project" dropdown). Refresh that project's board cache so the issue shows
  // the next time it's viewed. `useIssuesQuery` above only owns the current one.
  const queryClient = useQueryClient();
  const { record } = useUndoHistory();
  // Optimistic (MIN-40): the dialog closes without waiting for POST. The map
  // is inserted into the cache of the target project (visible on the next display),
  // replaced by the server line on success, removed + toast on failure.
  const createIssueInProject = useCallback(
    async (targetProjectId: string, input: CreateIssueInput) => {
      // Smart-fill (MIN-260): the server fills the ticket BEFORE inserting the
      // line, so no optimistic card — it would be empty for the duration of
      // remplissage. Cf. [create-issue-deferred](../../../../lib/create-issue-deferred.ts).
      if (input.smart_fill) {
        createIssueDeferred({ queryClient, projectId: targetProjectId, input, record });
        return null;
      }
      const optimistic = buildOptimisticIssue(
        input,
        targetProjectId,
        myUserId,
        queryClient.getQueryData<Issue[]>(["issues", targetProjectId]) ?? [],
      );
      // Registered BEFORE the patch (MIN-156): a GET response
      // played earlier can no longer make the newly created map disappear.
      const handle = issueWrites.begin({ kind: "insert", row: optimistic });
      insertIssueEverywhere(queryClient, targetProjectId, optimistic);
      // The map names its line: the real-time echo of our creation is
      // recognized, not adopted alongside it (lib/optimistic-issue.ts).
      void createIssueApi(targetProjectId, { ...input, id: optimistic.id }).then(
        (issue) => {
          insertIssueEverywhere(queryClient, targetProjectId, issue);
          mergeServerIssue(queryClient, targetProjectId, issue);
          issueWrites.settle(handle, issue);
          record({
            kind: "create",
            projectId: targetProjectId,
            issueId: issue.id,
            snapshot: snapshotIssue(issue),
          });
        },
        (err) => {
          issueWrites.fail(handle);
          removeIssueEverywhere(queryClient, targetProjectId, optimistic.id);
          toast.error((err as Error).message);
        },
      );
      return optimistic;
    },
    [queryClient, myUserId, record],
  );

  // Relations (MIN-25): open a related issue by id, add/remove relations.
  const openIssueById = useCallback((id: string) => {
    setOpenIssueId(id);
    setOpenIssueTab("description");
  }, []);
  const handleAddRelation = useCallback(
    (sourceId: string, type: IssueRelationType, targetId: string) => {
      void addRelation(sourceId, type, targetId).catch((err) =>
        toast.error((err as Error).message)
      );
    },
    [addRelation]
  );
  const handleRemoveRelation = useCallback(
    (relationId: string) => {
      void removeRelation(relationId).catch((err) =>
        toast.error((err as Error).message)
      );
    },
    [removeRelation]
  );

  const generatingViewIds = useMemo(
    () => new Set(Object.keys(generatingViews)),
    [generatingViews]
  );

  // Objective mode: the board is filtered to a single objective (plan §6).
  const activeObjective = objectiveParam
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

  const boardIssues = activeObjective ? objectiveIssues : normalIssues;
  const statuses = activeObjective ? STATUSES : visibleStatuses(config);
  const sort = activeObjective ? "manual" : config.sort;

  const handleCreateView = async (name: string, description?: string) => {
    const view = await createViewAndSelect(name);
    const wish = description?.trim();
    if (wish) {
      // Hand the view over to Numo: mark it generating, then ask Numo to fill in
      // its filters/sort from the description. It edits this exact view (the id
      // rides along in pageContext), and the board reflects the change live once
      // realtime brings the updated view back (see the config-sync effect).
      setGeneratingViews((prev) => ({ ...prev, [view.id]: view.updated_at }));
      const timer = setTimeout(() => {
        setGeneratingViews((prev) => {
          if (!(view.id in prev)) return prev;
          const next = { ...prev };
          delete next[view.id];
          return next;
        });
        genTimers.current.delete(view.id);
      }, 120_000);
      genTimers.current.set(view.id, timer);
      openAssistant({
        projectId,
        prompt: t("numoBuildViewPrompt", { name, description: wish }),
        pageContext: { projectId, viewId: view.id, viewName: name },
      });
    } else {
      toast.success(t("viewCreated", { name }));
    }
  };

  // Let Numo shape the currently selected view: open the chat carrying the
  // active view as context so "this view" resolves without the user re-stating
  // it. Reachable from the "Ask Numo" entry in the filters dropdown.
  const handleAskNumo = () => {
    openAssistant({
      projectId,
      pageContext: activeView
        ? { projectId, viewId: activeView.id, viewName: activeView.name }
        : { projectId },
    });
  };

  const openIssue = openIssueId
    ? issues.find((i) => i.id === openIssueId) ?? null
    : null;

  // “Save current view” (⌘K): the active view of a board lives in
  // localStorage, not in the address — without this postback, the view
  // saved would reopen the board on the currently stored view, not on
  // the one we were looking at. `?view=` is precisely the instruction that restores it
  // (see useBoardViews). The ticket opened in the side panel does not go away
  // not with: a saved view retains the page, not what is placed in front of it.
  usePublishCurrentView(
    activeView && project
      ? {
          href: buildViewHref(pathname, searchParams.toString(), {
            view: activeView.id,
          }),
          label: `${project.name} · ${activeView.name}`,
        }
      : null
  );

  // Publish what this board is showing to Numo (open issue > objective > tab),
  // so "this ticket" / "this objective" / "this view" resolve without searching.
  // The selected view rides along in every case so Numo can edit it in place.
  const viewCtx =
    !activeObjective && activeView
      ? { viewId: activeView.id, viewName: activeView.name }
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
        : activeObjective
          ? {
              projectId,
              objectiveId: activeObjective.id,
              objectiveName: activeObjective.name,
              objectiveColor: activeObjective.color,
            }
          : { projectId, ...viewCtx }
      : null
  );

  // Clear a view's "generating" spinner once Numo has touched it (its stored
  // config bumps updated_at) or it disappears. The safety timeout in
  // handleCreateView covers the case where Numo makes no change.
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

  // Deep-link from the Inbox: /projects/[id]?issue=<id> opens that issue.
  useEffect(() => {
    if (issueParam) {
      setOpenIssueId(issueParam);
      setOpenIssueTab("description");
    }
  }, [issueParam]);

  // Header "Nouveau → Nouvelle issue": /projects/[id]?new=issue opens the dialog.
  useEffect(() => {
    if (newParam === "issue") {
      setCreateStatus(undefined);
      setCreateOpen(true);
      router.replace(pathname);
    }
  }, [newParam, pathname, router]);

  // End of the creation wizard: /projects/[id]?setup=numo|import opens the primer
  // that the user has chosen (MIN-171). The URL only carries the statement —
  // what was entered travels in memory (project-seed-handoff) because a
  // `File` does not serialize. The instruction is single-use, like `?new=`
  // : closing it should not reopen it the next time it is rendered.
  useEffect(() => {
    if (setupParam !== "import" && setupParam !== "numo") return;
    // The first message NAMES the project: we are therefore waiting to know it.
    if (setupParam === "numo" && !project) return;
    if (!handoffTaken.current) {
      handoffTaken.current = true;
      takenHandoff.current = takeSeedHandoff();
      setHandoff(takenHandoff.current);
    }
    if (setupParam === "numo") {
      // The pasted brief (MIN-173) does not open a backstage pass: it OPENS
      // THE CONVERSATION. This is the same screen as "I'm talking about it with Numo", on
      // first message - the one that didn't stick starts with questions from
      // Numo, the one who pasted shares his text, and the two can
      // respond before a single ticket exists.
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

  if (projectsLoading && !project) {
    return (
      <div className="px-6 py-10">
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
        <h1 className="font-display text-xl font-semibold">{t("projectNotFoundTitle")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("projectNotFoundDescription")}
        </p>
        <Button asChild variant="outline">
          <Link href="/home">{t("backToHome")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {issuesLoading ? (
        <div className="min-h-0 flex-1 px-6 pt-4">
          <div className="flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-xl" />
            ))}
          </div>
        </div>
      ) : issues.length === 0 ? (
        /* Empty board: the THREE ways to put something on it, in order
 of what we do most — a ticket in hand (the shortcut se
 shows where it is used), the import of an existing backlog, the
 conversation with Numo. Nothing to read to understand: the scene says
 “nothing here, a first card will land there”, the buttons say the
 remains. Import and seed remain with the owner (the API reserves them for him, and he pays for the call). */
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-5xl">
            <EmptyScene icon={LayoutGrid} title={t("emptyTitle")}>
              {isOwner ? (
                <SplitButton
                  onClick={() => openCreate()}
                  menuLabel={t("emptyMoreWays")}
                  menu={
                    <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                      <FileUp />
                      {t("emptyImport")}
                    </DropdownMenuItem>
                  }
                >
                  <Plus />
                  {t("newIssue")}
                  <Kbd
                    size="sm"
                    className="ml-1 border-transparent bg-primary-foreground/15 text-primary-foreground"
                  >
                    C
                  </Kbd>
                </SplitButton>
              ) : (
                <Button type="button" onClick={() => openCreate()}>
                  <Plus />
                  {t("newIssue")}
                </Button>
              )}
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
        </div>
      ) : (
        <>
          <div className="shrink-0 px-6 pt-4">
            {activeObjective ? (
              <ObjectiveBanner
                objective={activeObjective}
                objectives={objectives}
                projectId={project.id}
                progress={objectiveProgress(activeObjective.id, issues)}
                lead={
                  activeObjective.lead_user_id
                    ? members.find((m) => m.user_id === activeObjective.lead_user_id) ??
                      null
                    : null
                }
              />
            ) : (
              <BoardToolbar
                tabOrderScope={project.id}
                views={views}
                activeViewId={activeViewId}
                generatingViewIds={generatingViewIds}
                onSelectView={selectView}
                config={config}
                onConfigChange={setConfig}
                members={members}
                categories={categories}
                objectives={objectives}
                integrations={integrations}
                dirty={dirty}
                onCreateView={handleCreateView}
                onUpdateActiveView={saveActiveView}
                onRenameView={renameView}
                onDeleteView={deleteView}
                onAskNumo={handleAskNumo}
                // The cycle is personal & cross-project: the tab exists on every
                // board but is canonical on /all only — here it just links out
                // (↗), it never scopes the cycle to this project (MIN-32).
                cycleTab={{
                  active: false,
                  external: true,
                  completionPercent: currentCycleCompletionPercent,
                  onSelect: () => router.push("/all?view=cycle"),
                }}
              />
            )}
          </div>
          <div className="min-h-0 flex-1 pt-3">
            <KanbanBoard
              issues={boardIssues}
              allIssues={issues}
              relations={relations}
              statuses={statuses}
              sort={sort}
              buildMenuActions={buildCycleMenuActions}
              currentCycleId={currentCycle?.id ?? null}
              onSetCycle={onSetIssueCycle}
              projectId={project.id}
              projectKey={project.key}
              members={members}
              categories={categories}
              objectives={objectives}
              onOpenIssue={(issue: Issue) => {
                setOpenIssueId(issue.id);
                setOpenIssueTab("description");
              }}
              onOpenIssueById={openIssueById}
              onAddRelation={handleAddRelation}
              onOpenPlan={(issue: Issue) => {
                setOpenIssueId(issue.id);
                setOpenIssueTab("plan");
              }}
              onCreateIssue={openCreate}
              onAskNumo={(selectedIssues) => openAssistant({
                projectId: project.id,
                pageContext: {
                  projectId: project.id,
                  ...issuesPageContext(selectedIssues, (issue) =>
                    issueIdentifier(project.key, issue.number)
                  ),
                },
              })}
              onUpdateIssue={(id, patch) =>
                void updateIssue(id, patch).catch((err) =>
                  toast.error((err as Error).message)
                )
              }
              onSetCategories={(id, ids) =>
                void setCategories(id, ids).catch((err) =>
                  toast.error((err as Error).message)
                )
              }
              onDeleteIssue={deleteIssue}
              onMove={moveIssue}
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
          onCreateInProject={createIssueInProject}
          initialStatus={createStatus}
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

      {sidePanelMounted ? (
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
          projectKey={project.key}
          members={members}
          categories={categories}
          objectives={objectives}
          allIssues={issues}
          relations={relations}
          onUpdate={updateIssue}
          onDelete={deleteIssue}
          onSetCategories={setCategories}
          onCreate={createIssue}
          onOpenIssue={(id) => {
            setOpenIssueId(id);
            setOpenIssueTab("description");
          }}
          onAddRelation={handleAddRelation}
          onRemoveRelation={handleRemoveRelation}
          initialTab={openIssueTab}
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
      <ProjectBoard />
    </Suspense>
  );
}
