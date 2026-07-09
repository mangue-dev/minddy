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
import { Button, Skeleton, toast } from "mangue-ui";
import { ListTodo } from "lucide-react";
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
import {
  DEFAULT_CONFIG,
  configsEqual,
  filterIssues,
  normalizeConfig,
  viewConfigOf,
  visibleStatuses,
} from "@/lib/view-filter";
import { STATUSES, issueIdentifier, type IssueStatus } from "@/lib/issue-constants";
import {
  useAssistantContext,
  useAssistantPanel,
} from "@/lib/assistant-panel-context";
import { CreateIssueDialog } from "@/components/create-issue-dialog";
import { IssueSidePanel } from "@/components/issue-side-panel";
import { KanbanBoard } from "@/components/kanban-board";
import { BoardToolbar } from "@/components/board-toolbar";
import { ObjectiveBanner } from "@/components/objective-banner";
import { ObjectiveDialog } from "@/components/objective-dialog";
import { createIssueApi } from "@/lib/issues-api";
import type {
  CreateIssueInput,
  Issue,
  IssueRelationType,
  Onglet,
  View,
  ViewConfig,
} from "@/lib/types";

/** Where the last-selected view is remembered (per project + onglet). */
const viewStorageKey = (projectId: string, onglet: Onglet) =>
  `minddy:view:${projectId}:${onglet}`;

function readStoredView(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredView(key: string, id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(key, id);
    else window.localStorage.removeItem(key);
  } catch {
    /* localStorage unavailable (private mode / disabled) — ignore. */
  }
}

function ProjectBoard() {
  const t = useTranslations("Board");
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const objectiveParam = searchParams.get("objective");
  const issueParam = searchParams.get("issue");
  const newParam = searchParams.get("new");

  // The onglet is the route: /projects/[id] = all, /projects/[id]/my = mine.
  const onglet: Onglet = pathname.endsWith("/my") ? "my" : "all";

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
  const { objectives, createObjective, updateObjective } = useObjectivesQuery(projectId);
  const { integrations } = useIntegrationsQuery(projectId);
  const {
    views,
    loading: viewsLoading,
    createView,
    updateView,
    deleteView,
  } = useViewsQuery(projectId);
  const { user } = useAuth();
  const myUserId = user?.id ?? null;
  const { open: openAssistant } = useAssistantPanel();

  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<IssueStatus | undefined>(undefined);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  // Which tab the side panel shows when it (re)opens on an issue.
  const [openIssueTab, setOpenIssueTab] = useState<"description" | "plan">(
    "description"
  );
  const [objectiveEditOpen, setObjectiveEditOpen] = useState(false);
  // Views Numo is currently building from a description (their chip shows a
  // spinner). Maps view id → the view's updated_at when generation started;
  // cleared when the view's stored config changes (Numo applied filters) or
  // after a safety timeout.
  const [generatingViews, setGeneratingViews] = useState<Record<string, string>>(
    {}
  );
  const genTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Signature of the config we last applied from the active view — lets us tell
  // an external change to that view (Numo, a teammate) apart from the user's own
  // local edits, so we adopt the former live without clobbering the latter.
  const appliedSigRef = useRef<string | null>(null);

  // Open the create dialog, optionally preset to a column's status.
  const openCreate = (status?: IssueStatus) => {
    setCreateStatus(status);
    setCreateOpen(true);
  };

  // Create in an arbitrary project (the create dialog's "create in another
  // project" dropdown). Refresh that project's board cache so the issue shows
  // the next time it's viewed. `useIssuesQuery` above only owns the current one.
  const queryClient = useQueryClient();
  const createIssueInProject = useCallback(
    async (targetProjectId: string, input: CreateIssueInput) => {
      const issue = await createIssueApi(targetProjectId, input);
      void queryClient.invalidateQueries({
        queryKey: ["issues", targetProjectId],
      });
      return issue;
    },
    [queryClient],
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

  // Saved-view state (the My/All onglet now comes from the route).
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [config, setConfig] = useState<ViewConfig>(DEFAULT_CONFIG);
  const storageKey = viewStorageKey(projectId, onglet);
  const restoredKeyRef = useRef<string | null>(null);

  // Reset the working view state the instant the project or onglet (route)
  // changes — during render, so no frame shows the previous board's view before
  // the restore effect runs. `storageKey` encodes both project id and onglet.
  const [prevKey, setPrevKey] = useState(storageKey);
  if (prevKey !== storageKey) {
    setPrevKey(storageKey);
    setActiveViewId(null);
    setConfig(DEFAULT_CONFIG);
  }

  const ongletViews = useMemo(
    () => views.filter((v) => v.onglet === onglet),
    [views, onglet]
  );
  const activeView = ongletViews.find((v) => v.id === activeViewId) ?? null;
  const generatingViewIds = useMemo(
    () => new Set(Object.keys(generatingViews)),
    [generatingViews]
  );
  const baseline = activeView ? viewConfigOf(activeView) : DEFAULT_CONFIG;
  const dirty = !configsEqual(config, baseline);

  // Objective mode: the board is filtered to a single objective (plan §6).
  const activeObjective = objectiveParam
    ? objectives.find((o) => o.id === objectiveParam) ?? null
    : null;

  const normalIssues = useMemo(
    () => filterIssues(issues, config, { onglet, myUserId }),
    [issues, config, onglet, myUserId]
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

  const selectView = (id: string | null) => {
    setActiveViewId(id);
    const v = id ? ongletViews.find((x) => x.id === id) : null;
    setConfig(v ? viewConfigOf(v) : DEFAULT_CONFIG);
    writeStoredView(storageKey, id);
  };
  const handleCreateView = async (name: string, description?: string) => {
    const view = await createView({ onglet, name, ...config });
    setActiveViewId(view.id);
    writeStoredView(storageKey, view.id);
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
        pageContext: { projectId, onglet, viewId: view.id, viewName: name },
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
        ? { projectId, onglet, viewId: activeView.id, viewName: activeView.name }
        : { projectId, onglet },
    });
  };
  const handleUpdateActiveView = async () => {
    if (!activeView) return;
    try {
      await updateView(activeView.id, {
        filters: config.filters,
        sort: config.sort,
        display: config.display,
      });
      toast.success(t("viewUpdated"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  const handleRenameView = async (view: View, name: string) => {
    await updateView(view.id, { name });
  };
  const handleDeleteView = async (view: View) => {
    if (ongletViews.length <= 1) {
      toast.error(t("needOneView"));
      return;
    }
    try {
      await deleteView(view.id);
      if (view.id === activeViewId) {
        // Fall back to another view — never leave the onglet without a selection.
        const next = ongletViews.find((v) => v.id !== view.id);
        if (next) selectView(next.id);
      }
      toast.success(t("viewDeleted"));
    } catch (err) {
      toast.error((err as Error).message);
    }
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
            onglet,
            issueId: openIssue.id,
            issueIdentifier: issueIdentifier(project.key, openIssue.number),
            issueTitle: openIssue.title,
            ...viewCtx,
          }
        : activeObjective
          ? {
              projectId,
              onglet,
              objectiveId: activeObjective.id,
              objectiveName: activeObjective.name,
            }
          : { projectId, onglet, ...viewCtx }
      : null
  );

  // Ensure every onglet always has at least one real view: seed a default
  // "Toutes" (empty config) when it has none. The old "Toutes" was virtual — now
  // every view is real, so it can be renamed/deleted like the others. Seed only
  // when empty, so deleting "Toutes" (with others present) doesn't recreate it.
  const seededKeyRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (viewsLoading || ongletViews.length > 0) return;
    if (seededKeyRef.current.has(storageKey)) return;
    seededKeyRef.current.add(storageKey);
    void createView({
      onglet,
      name: t("defaultViewName"),
      filters: {},
      sort: "manual",
      display: {},
    }).catch(() => seededKeyRef.current.delete(storageKey));
  }, [viewsLoading, ongletViews, onglet, storageKey, createView, t]);

  // Restore the last-selected view for this project + onglet once its views have
  // loaded (falling back to the first view), so a saved view — its filters and
  // sort — survives a page reload. Runs once per onglet.
  useEffect(() => {
    if (viewsLoading || ongletViews.length === 0) return;
    if (restoredKeyRef.current === storageKey) return;
    restoredKeyRef.current = storageKey;
    const savedId = readStoredView(storageKey);
    const view =
      (savedId ? ongletViews.find((v) => v.id === savedId) : undefined) ??
      ongletViews[0];
    setActiveViewId(view.id);
    setConfig(viewConfigOf(view));
  }, [storageKey, viewsLoading, ongletViews]);

  // Keep the working config in sync when the ACTIVE view's stored config changes
  // underneath us — Numo editing it (incl. the "Ask Numo" / generate-a-view
  // flows) or a teammate editing a shared view. Only adopt when the user has no
  // unsaved local edits (working config still matches what we last applied), so
  // we never overwrite their in-progress tweaks.
  useEffect(() => {
    if (!activeView) {
      appliedSigRef.current = null;
      return;
    }
    const storedSig = normalizeConfig(viewConfigOf(activeView));
    const prev = appliedSigRef.current;
    if (prev === storedSig) return;
    appliedSigRef.current = storedSig;
    if (prev === null) return; // first observation — select/restore set config
    if (normalizeConfig(config) === prev) setConfig(viewConfigOf(activeView));
  }, [activeView, config]);

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

  // `C` opens the quick-create dialog (unless typing or a dialog is already open).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "c" && e.key !== "C") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (typing || createOpen || openIssueId || objectiveEditOpen) return;
      e.preventDefault();
      setCreateStatus(undefined);
      setCreateOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, openIssueId, objectiveEditOpen]);

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
        <div className="min-h-0 flex-1 px-6 pt-4">
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <ListTodo className="size-6" />
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">
              {t("noIssuesYet")}{" "}
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">C</kbd>.
            </p>
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
                onEdit={() => setObjectiveEditOpen(true)}
              />
            ) : (
              <BoardToolbar
                views={ongletViews}
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
                onUpdateActiveView={handleUpdateActiveView}
                onRenameView={handleRenameView}
                onDeleteView={handleDeleteView}
                onAskNumo={handleAskNumo}
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
        initialObjectiveId={activeObjective?.id ?? null}
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

      {activeObjective && (
        <ObjectiveDialog
          open={objectiveEditOpen}
          onOpenChange={setObjectiveEditOpen}
          members={members}
          objective={activeObjective}
          onCreate={createObjective}
          onUpdate={updateObjective}
        />
      )}
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
