"use client";

import { Button, Skeleton } from "mangue-ui";
import { FolderPlus, Plus } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { ProjectCard } from "@/components/project-card";
import { PendingInvitationsBanner } from "@/components/pending-invitations-banner";

export default function HomePage() {
  const { projects, loading, openCreateProject } = useProjects();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <PendingInvitationsBanner />

      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Mes Projets
        </h1>
        {projects.length > 0 && (
          <Button onClick={openCreateProject}>
            <Plus />
            Nouveau Projet
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <FolderPlus className="size-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Aucun Projet pour l&apos;instant
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Un Projet est ton espace de travail : issues, membres et catégories
              y vivent. Crée ton premier Projet pour commencer.
            </p>
          </div>
          <Button onClick={openCreateProject}>
            <FolderPlus />
            Nouveau Projet
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
