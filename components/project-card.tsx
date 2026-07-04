"use client";

import Link from "next/link";
import { Badge } from "mangue-ui";
import type { Project } from "@/lib/types";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10 transition-colors hover:ring-foreground/25"
    >
      <div className="flex items-start justify-between gap-2">
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
        <Badge variant="secondary" className="font-mono">
          {project.key}
        </Badge>
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium group-hover:underline">{project.name}</p>
      </div>
    </Link>
  );
}
