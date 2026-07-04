"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Skeleton, toast } from "mangue-ui";
import { Plus, ListTodo } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useViewsQuery } from "@/lib/use-views-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useObjectivesQuery, objectiveProgress } from "@/lib/use-objectives-query";
import {
  DEFAULT_CONFIG,
  configsEqual,
  filterIssues,
  viewConfigOf,
  visibleStatuses,
} from "@/lib/view-filter";
import { STATUSES } from "@/lib/issue-constants";
import { ProjectHeader } from "@/components/project-header";
import { CreateIssueDialog } from "@/components/create-issue-dialog";
import { IssueSidePanel } from "@/components/issue-side-panel";
import { KanbanBoard } from "@/components/kanban-board";
import { BoardToolbar } from "@/components/board-toolbar";
import { ObjectiveBanner } from "@/components/objective-banner";
import { ObjectiveDialog } from "@/components/objective-dialog";
import type { Issue, Onglet, View, ViewConfig } from "@/lib/types";

function ProjectBoard() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const objectiveParam = searchParams.get("objective");
  const issueParam = searchParams.get("issue");

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
  const { members } = useMembersQuery(projectId, !!project);
  const { categories } = useCategoriesQuery(projectId);
  const { objectives, createObjective, updateObjective } = useObjectivesQuery(projectId);
  const { views, createView, updateView, deleteView } = useViewsQuery(projectId);
  const { user } = useAuth();
  const myUserId = user?.id ?? null;

  const [createOpen, setCreateOpen] = useState(false);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const [objectiveEditOpen, setObjectiveEditOpen] = useState(false);

  // Views & onglets state.
  const [onglet, setOnglet] = useState<Onglet>("all");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [config, setConfig] = useState<ViewConfig>(DEFAULT_CONFIG);

  const showMyTab = members.length > 1; // owner + at least one member = shared
  const ongletViews = useMemo(
    () => views.filter((v) => v.onglet === onglet),
    [views, onglet]
  );
  const activeView = ongletViews.find((v) => v.id === activeViewId) ?? null;
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

  // Sub-issue progress per parent (from ALL issues, ignoring the active filter).
  const subProgress = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const i of issues) {
      if (!i.parent_id) continue;
      const e = map.get(i.parent_id) ?? { done: 0, total: 0 };
      e.total++;
      if (i.status === "done") e.done++;
      map.set(i.parent_id, e);
    }
    return map;
  }, [issues]);

  const selectOnglet = (next: Onglet) => {
    setOnglet(next);
    setActiveViewId(null);
    setConfig(DEFAULT_CONFIG);
  };
  const selectView = (id: string | null) => {
    setActiveViewId(id);
    const v = id ? ongletViews.find((x) => x.id === id) : null;
    setConfig(v ? viewConfigOf(v) : DEFAULT_CONFIG);
  };
  const handleCreateView = async (name: string) => {
    const view = await createView({ onglet, name, ...config });
    setActiveViewId(view.id);
    toast.success(`Vue « ${name} » créée.`);
  };
  const handleUpdateActiveView = async () => {
    if (!activeView) return;
    try {
      await updateView(activeView.id, {
        filters: config.filters,
        sort: config.sort,
        display: config.display,
      });
      toast.success("Vue mise à jour.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  const handleRenameView = async (view: View, name: string) => {
    await updateView(view.id, { name });
  };
  const handleDeleteView = async (view: View) => {
    try {
      await deleteView(view.id);
      if (view.id === activeViewId) selectView(null);
      toast.success("Vue supprimée.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const openIssue = openIssueId
    ? issues.find((i) => i.id === openIssueId) ?? null
    : null;

  useEffect(() => {
    if (!showMyTab && onglet === "my") {
      setOnglet("all");
      setActiveViewId(null);
      setConfig(DEFAULT_CONFIG);
    }
  }, [showMyTab, onglet]);

  // Deep-link from the Inbox: /projects/[id]?issue=<id> opens that issue.
  useEffect(() => {
    if (issueParam) setOpenIssueId(issueParam);
  }, [issueParam]);

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
        <h1 className="font-display text-xl font-semibold">Projet introuvable</h1>
        <p className="text-sm text-muted-foreground">
          Ce Projet n&apos;existe pas ou tu n&apos;y as pas accès.
        </p>
        <Button asChild variant="outline">
          <Link href="/home">Retour à l&apos;accueil</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ProjectHeader
        project={project}
        active="issues"
        right={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Nouvelle issue
          </Button>
        }
      />

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
              Aucune issue. Crée la première avec « Nouvelle issue » ou la touche{" "}
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
                onglet={onglet}
                onOngletChange={selectOnglet}
                showMyTab={showMyTab}
                views={ongletViews}
                activeViewId={activeViewId}
                onSelectView={selectView}
                config={config}
                onConfigChange={setConfig}
                members={members}
                categories={categories}
                objectives={objectives}
                dirty={dirty}
                onCreateView={handleCreateView}
                onUpdateActiveView={handleUpdateActiveView}
                onRenameView={handleRenameView}
                onDeleteView={handleDeleteView}
              />
            )}
          </div>
          <div className="min-h-0 flex-1 px-6 pt-3 pb-6">
            {boardIssues.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
                <p className="text-sm text-muted-foreground">
                  {activeObjective
                    ? "Aucune issue dans cet objectif."
                    : "Aucune issue ne correspond à cette vue."}
                </p>
              </div>
            ) : (
              <KanbanBoard
                issues={boardIssues}
                statuses={statuses}
                sort={sort}
                projectKey={project.key}
                members={members}
                categories={categories}
                subProgress={subProgress}
                onOpenIssue={(issue: Issue) => setOpenIssueId(issue.id)}
                onMove={moveIssue}
              />
            )}
          </div>
        </>
      )}

      <CreateIssueDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        members={members}
        categories={categories}
        objectives={objectives}
        onCreate={createIssue}
      />

      <IssueSidePanel
        issue={openIssue}
        open={!!openIssue}
        onOpenChange={(next) => {
          if (!next) {
            setOpenIssueId(null);
            // Strip the deep-link param so re-opening the same issue works.
            if (issueParam) router.replace(`/projects/${projectId}`);
          }
        }}
        projectKey={project.key}
        members={members}
        categories={categories}
        objectives={objectives}
        allIssues={issues}
        onUpdate={updateIssue}
        onDelete={deleteIssue}
        onSetCategories={setCategories}
        onCreate={createIssue}
        onOpenIssue={(id) => setOpenIssueId(id)}
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
