"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Skeleton } from "mangue-ui";
import { Settings2, Plus, ListTodo } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { ProjectSettingsDialog } from "@/components/project-settings-dialog";
import { CreateIssueDialog } from "@/components/create-issue-dialog";
import { IssueSidePanel } from "@/components/issue-side-panel";
import { KanbanBoard } from "@/components/kanban-board";
import type { Issue } from "@/lib/types";

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
  } = useIssuesQuery(projectId);
  const { members } = useMembersQuery(projectId, !!project);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);

  const openIssue = openIssueId
    ? issues.find((i) => i.id === openIssueId) ?? null
    : null;

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

      <div className="min-h-0 flex-1 px-6 pb-6">
        {issuesLoading ? (
          <div className="flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-xl" />
            ))}
          </div>
        ) : issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <ListTodo className="size-6" />
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">
              Aucune issue. Crée la première avec « Nouvelle issue » ou la touche{" "}
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">C</kbd>.
            </p>
          </div>
        ) : (
          <KanbanBoard
            issues={issues}
            projectKey={project.key}
            members={members}
            onOpenIssue={(issue: Issue) => setOpenIssueId(issue.id)}
            onMove={moveIssue}
          />
        )}
      </div>

      <CreateIssueDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        members={members}
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
        onUpdate={updateIssue}
        onDelete={deleteIssue}
      />

      <ProjectSettingsDialog
        project={project}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}
