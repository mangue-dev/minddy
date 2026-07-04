"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Skeleton } from "mangue-ui";
import { Settings2, ListTodo } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { ProjectSettingsDialog } from "@/components/project-settings-dialog";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const { projects, loading } = useProjects();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const project = projects.find((p) => p.id === params.id);

  if (loading && !project) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 px-6 py-20 text-center">
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
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="flex size-10 items-center justify-center rounded-lg font-mono text-sm font-semibold"
            style={{
              backgroundColor: project.color ?? "var(--muted)",
              color: project.color ? "#fff" : "var(--muted-foreground)",
            }}
            aria-hidden
          >
            {project.key.slice(0, 2)}
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {project.name}
            </h1>
            <Badge variant="secondary" className="mt-1 font-mono">
              {project.key}
            </Badge>
          </div>
        </div>
        <Button variant="outline" onClick={() => setSettingsOpen(true)}>
          <Settings2 />
          Paramètres
        </Button>
      </div>

      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <ListTodo className="size-6" />
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">
          Le board d&apos;issues (kanban, onglets, Vues) arrive au prochain
          chantier. Pour l&apos;instant, tu peux gérer le nom et la clé du Projet.
        </p>
      </div>

      <ProjectSettingsDialog
        project={project}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}
