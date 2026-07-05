"use client";

import { Skeleton } from "mangue-ui";
import { useProjects } from "@/lib/projects-context";
import { ProjectCard, NewProjectCard } from "@/components/project-card";
import { PendingInvitationsBanner } from "@/components/pending-invitations-banner";

// auto-fit (not auto-fill) collapses empty trailing tracks so a lone card grows
// into the available width; the 380px cap keeps it at a comfortable size.
const GRID_STYLE = {
  gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 380px))",
  gridAutoRows: "1fr",
} as const;

export default function HomePage() {
  const { projects, loading, openCreateProject } = useProjects();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <PendingInvitationsBanner />

      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">
        Mes Projets
      </h1>

      {loading ? (
        <div className="grid gap-4" style={GRID_STYLE}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[160px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4" style={GRID_STYLE}>
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
          <NewProjectCard onClick={openCreateProject} />
        </div>
      )}
    </div>
  );
}
