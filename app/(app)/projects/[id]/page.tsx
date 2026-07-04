"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Skeleton, toast } from "mangue-ui";
import { Settings2, Plus, ListTodo } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useViewsQuery } from "@/lib/use-views-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import {
  DEFAULT_CONFIG,
  configsEqual,
  filterIssues,
  viewConfigOf,
  visibleStatuses,
} from "@/lib/view-filter";
import { ProjectSettingsDialog } from "@/components/project-settings-dialog";
import { CreateIssueDialog } from "@/components/create-issue-dialog";
import { IssueSidePanel } from "@/components/issue-side-panel";
import { KanbanBoard } from "@/components/kanban-board";
import { BoardToolbar } from "@/components/board-toolbar";
import type { Issue, Onglet, View, ViewConfig } from "@/lib/types";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
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
  const { views, createView, updateView, deleteView } = useViewsQuery(projectId);
  const { user } = useAuth();
  const myUserId = user?.id ?? null;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);

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

  const filteredIssues = useMemo(
    () => filterIssues(issues, config, { onglet, myUserId }),
    [issues, config, onglet, myUserId]
  );
  const statuses = useMemo(() => visibleStatuses(config), [config]);

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

  // If the project is no longer shared, fall back to the All onglet.
  useEffect(() => {
    if (!showMyTab && onglet === "my") {
      setOnglet("all");
      setActiveViewId(null);
      setConfig(DEFAULT_CONFIG);
    }
  }, [showMyTab, onglet]);

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
      if (typing || settingsOpen || createOpen || openIssueId) return;
      e.preventDefault();
      setCreateOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen, createOpen, openIssueId]);

  if (projectsLoading && !project) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 px-6 py-20 text-center">
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
      <div className="flex shrink-0 items-center justify-between gap-4 px-6 pt-8 pb-4">
        <div className="flex items-center gap-3">
          <span
            className="flex size-9 items-center justify-center rounded-lg font-mono text-xs font-semibold"
            style={{
              backgroundColor: project.color ?? "var(--muted)",
              color: project.color ? "#fff" : "var(--muted-foreground)",
            }}
            aria-hidden
          >
            {project.key.slice(0, 2)}
          </span>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-semibold tracking-tight">
              {project.name}
            </h1>
            <Badge variant="secondary" className="font-mono">
              {project.key}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Paramètres" onClick={() => setSettingsOpen(true)}>
            <Settings2 />
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Nouvelle issue
          </Button>
        </div>
      </div>

      {issuesLoading ? (
        <div className="min-h-0 flex-1 px-6 pb-6">
          <div className="flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-xl" />
            ))}
          </div>
        </div>
      ) : issues.length === 0 ? (
        <div className="min-h-0 flex-1 px-6 pb-6">
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
          <div className="shrink-0 px-6 pb-3">
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
              dirty={dirty}
              onCreateView={handleCreateView}
              onUpdateActiveView={handleUpdateActiveView}
              onRenameView={handleRenameView}
              onDeleteView={handleDeleteView}
            />
          </div>
          <div className="min-h-0 flex-1 px-6 pb-6">
            {filteredIssues.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
                <p className="text-sm text-muted-foreground">
                  Aucune issue ne correspond à cette vue.
                </p>
              </div>
            ) : (
              <KanbanBoard
                issues={filteredIssues}
                statuses={statuses}
                sort={config.sort}
                projectKey={project.key}
                members={members}
                categories={categories}
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
        onCreate={createIssue}
      />

      <IssueSidePanel
        issue={openIssue}
        open={!!openIssue}
        onOpenChange={(next) => {
          if (!next) setOpenIssueId(null);
        }}
        projectKey={project.key}
        members={members}
        categories={categories}
        onUpdate={updateIssue}
        onDelete={deleteIssue}
        onSetCategories={setCategories}
      />

      <ProjectSettingsDialog
        project={project}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}
