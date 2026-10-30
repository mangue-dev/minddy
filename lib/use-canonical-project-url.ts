"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useProjects } from "./projects-context";
import { projectRef, resolveProjectSegment } from "./app-urls";
import { projectSegmentFromPath } from "./project-id-from-path";

/**
 * Rewrite the address bar to the canonical readable form of the current
 * project (`/projects/min-3f2a9c81/…`) when it arrives as a bare code (a
 * server-built or migrated link), a legacy id or under a renamed key. The
 * history entry is replaced, never added, and nothing re-renders but the URL.
 */
export function useCanonicalProjectUrl(): void {
  const pathname = usePathname();
  const { projects } = useProjects();
  useEffect(() => {
    const segment = projectSegmentFromPath(pathname);
    if (!segment) return;
    const project = resolveProjectSegment(segment, projects);
    if (!project) return;
    const canonical = projectRef(project);
    if (canonical === segment) return;
    const { search, hash } = window.location;
    const path = pathname.replace(`/projects/${segment}`, `/projects/${canonical}`);
    window.history.replaceState(window.history.state, "", `${path}${search}${hash}`);
  }, [pathname, projects]);
}
