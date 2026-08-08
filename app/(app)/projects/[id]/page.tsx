"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useViewsQuery } from "@/lib/use-views-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useObjectivesQuery, objectiveProgress } from "@/lib/use-objectives-query";
import { useIntegrationsQuery } from "@/lib/use-integrations-query";
import { useMyCycleQuery } from "@/lib/use-my-cycle-query";
import { useBoardViews } from "@/lib/use-board-views";
import { ME_ASSIGNEE, filterIssues, visibleStatuses } from "@/lib/view-filter";
import { STATUSES, issueIdentifier, type IssueStatus } from "@/lib/issue-constants";
import {
  useAssistantContext,
  useAssistantPanel,
} from "@/lib/assistant-panel-context";
import { issuesPageContext } from "@/lib/assistant-issue-context";
import { CreateIssueDialog } from "@/components/create-issue-dialog";
import { NumoIcon } from "@/components/numo-icon";
import { EmptyScene } from "@/components/empty-scene";
import { IssueSidePanel } from "@/components/issue-side-panel";
import { KanbanBoard } from "@/components/kanban-board";
import { BoardToolbar } from "@/components/board-toolbar";
import { useCycleMenuActions } from "@/components/cycle/use-cycle-menu-actions";
import { ObjectiveBanner } from "@/components/objective-banner";
import { ProjectImportDialog } from "@/components/project-seed/project-import-dialog";
import { takeSeedHandoff } from "@/lib/project-seed-handoff";
import { createIssueApi } from "@/lib/issues-api";
import {
  insertIssueEverywhere,
  issueWrites,
  mergeServerIssue,
  removeIssueEverywhere,
} from "@/lib/optimistic/issue-writes";
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
  // Import et amorce par Numo sont réservés au propriétaire (l'API les lui
  // réserve) : le board vide ne montre que ce qui est réellement à portée.
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
  const [createStatus, setCreateStatus] = useState<IssueStatus | undefined>(undefined);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  // Which tab the side panel shows when it (re)opens on an issue.
  const [openIssueTab, setOpenIssueTab] = useState<"description" | "plan">(
    "description"
  );
  // L'amorce par import (MIN-171) : `?setup=import` ouvre le panneau d'import
  // avec le CSV déposé dans le wizard.
  const [importOpen, setImportOpen] = useState(false);
  // Ce que le wizard a récolté une étape plus tôt (brief collé, CSV déposé).
  // Pris une fois : le rouvrir plus tard repart d'une surface vide.
  const [handoff, setHandoff] = useState<ReturnType<typeof takeSeedHandoff>>(null);
  // La remise se PREND, elle ne se relit pas : un effet rejoué (StrictMode en
  // dev le fait systématiquement) la trouverait vide et effacerait celle qu'on
  // vient d'obtenir. Le ref en garde donc une copie, que les rejeux relisent
  // au lieu d'une remise déjà consommée.
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
  // Optimistic (MIN-40) : le dialog se ferme sans attendre le POST. La carte
  // est insérée dans le cache du projet cible (visible au prochain affichage),
  // remplacée par la ligne serveur au succès, retirée + toast à l'échec.
  const createIssueInProject = useCallback(
    async (targetProjectId: string, input: CreateIssueInput) => {
      const optimistic = buildOptimisticIssue(
        input,
        targetProjectId,
        myUserId,
        queryClient.getQueryData<Issue[]>(["issues", targetProjectId]) ?? [],
      );
      // Inscrite au registre AVANT le patch (MIN-156) : une réponse de GET
      // partie plus tôt ne peut plus faire disparaître la carte à peine créée.
      const handle = issueWrites.begin({ kind: "insert", row: optimistic });
      insertIssueEverywhere(queryClient, targetProjectId, optimistic);
      // La carte nomme sa ligne : l'écho temps réel de notre création est
      // reconnu, pas adopté à côté d'elle (lib/optimistic-issue.ts).
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
  // active view as context so "cette vue" resolves without the user re-stating
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

  // Publish what this board is showing to Numo (open issue > objective > tab),
  // so "ce ticket" / "cet objectif" / "cette vue" resolve without searching.
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

  // Fin du wizard de création : /projects/[id]?setup=numo|import ouvre l'amorce
  // que l'utilisateur a choisie (MIN-171). L'URL ne porte que l'instruction —
  // ce qui a été saisi voyage en mémoire (project-seed-handoff) parce qu'un
  // `File` ne se sérialise pas. L'instruction est à usage unique, comme `?new=`
  // : la refermer ne doit pas la rouvrir au rendu suivant.
  useEffect(() => {
    if (setupParam !== "import" && setupParam !== "numo") return;
    // Le premier message NOMME le projet : on attend donc de le connaître.
    if (setupParam === "numo" && !project) return;
    if (!handoffTaken.current) {
      handoffTaken.current = true;
      takenHandoff.current = takeSeedHandoff();
      setHandoff(takenHandoff.current);
    }
    if (setupParam === "numo") {
      // Le brief collé (MIN-173) n'ouvre pas une passe en coulisses : il OUVRE
      // LA CONVERSATION. C'est le même écran que « j'en parle avec Numo », au
      // premier message près — celui qui n'a rien collé part des questions de
      // Numo, celui qui a collé part de son texte, et les deux peuvent se
      // répondre avant qu'un seul ticket existe.
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
        /* Board vide : les TROIS façons d'y mettre quelque chose, dans l'ordre
           de ce qu'on fait le plus — un ticket à la main (le raccourci se
           montre là où il sert), l'import d'un backlog existant, la
           conversation avec Numo. Rien à lire pour comprendre : la scène dit
           « rien ici, une première carte va s'y poser », les boutons disent le
           reste. Import et amorce restent au propriétaire (l'API les lui
           réserve, et c'est lui qui paye l'appel). */
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
        // Le board projet ouvre son propre dialog (préréglages de colonne) —
        // distingué du dialog global dans les stats.
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

      <ProjectImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        projectId={projectId}
        initialFile={handoff?.kind === "import" ? handoff.file : null}
      />
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
