"use client";

import { useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { projectIdFromPath } from "@/lib/project-id-from-path";
import { useHiddenProjects } from "@/lib/use-hidden-projects";
import type { Project } from "@/lib/types";

/**
 * May a picker OFFER this project, or something that belongs to it (MIN-751)?
 *
 * A project I hid (MIN-692) is never proposed: not in the palette, not after
 * an “@”, not in a project, objective or context picker. The project on screen
 * is the one exception, as for the sidebar switcher: opening a hidden project
 * by link still lets me work in it.
 *
 * Only what is OFFERED is filtered. Mentions and links already written keep
 * resolving their labels and destinations from the complete sources.
 */
export function isOfferedProject(
  projectId: string,
  hiddenProjectIds: ReadonlySet<string>,
  onScreen: ReadonlyArray<string | null | undefined> = [],
): boolean {
  return !hiddenProjectIds.has(projectId) || onScreen.includes(projectId);
}

/**
 * The offer rule bound to my hidden projects. The project on screen comes from
 * the URL; `surfaceProjectId` adds the project of the surface itself (an issue
 * panel opened over another route, a Numo scope), which counts as on screen.
 */
export function useOfferedProject(surfaceProjectId?: string | null): (projectId: string) => boolean {
  const { hiddenProjectIds } = useHiddenProjects();
  const pathname = usePathname();
  const routeProjectId = pathname ? projectIdFromPath(pathname) : null;
  return useCallback(
    (projectId: string) => isOfferedProject(projectId, hiddenProjectIds, [routeProjectId, surfaceProjectId]),
    [hiddenProjectIds, routeProjectId, surfaceProjectId],
  );
}

/** `projects` without the ones a picker may not offer (see `useOfferedProject`). */
export function useOfferedProjects<P extends Pick<Project, "id">>(
  projects: P[],
  surfaceProjectId?: string | null,
): P[] {
  const offered = useOfferedProject(surfaceProjectId);
  return useMemo(() => {
    const kept = projects.filter((project) => offered(project.id));
    return kept.length === projects.length ? projects : kept;
  }, [projects, offered]);
}
