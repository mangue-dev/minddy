"use client";

import Link from "next/link";
import { ProjectOrb } from "@/components/project-orb";
import type { Project } from "@/lib/types";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10 transition-colors hover:ring-foreground/25"
    >
      <ProjectOrb seed={project.id} className="size-9 rounded-[10px]" />
      <div className="min-w-0">
        <p className="truncate font-medium group-hover:underline">{project.name}</p>
      </div>
    </Link>
  );
}
