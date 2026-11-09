"use client";

import { useEffect, useRef, useState } from "react";
import { useProjects } from "./projects-context";
import type { Project } from "./types";

/**
 * - `loading`: the list cannot answer yet, show the screen's skeleton.
 * - `ready`: the project is in the list.
 * - `missing`: a list read after this lookup started does not contain it.
 * - `error`: the list could not be read, so nothing is known about it.
 */
export type ProjectLookupState = "loading" | "ready" | "missing" | "error";

export interface ProjectLookup {
  project: Project | undefined;
  state: ProjectLookupState;
  error: Error | null;
  retry: () => void;
}

/**
 * Finds a project screen's project in the viewer's list, and says it is
 * missing only once a fresh read confirms it (MIN-937).
 *
 * The cached list can predate the project: a snapshot restored from disk, or
 * a list read before the project was created or the viewer joined it. A
 * project absent from that list is therefore read again once, as the Pages
 * shell does for a page code (components/pages/pages-shell.tsx), before the
 * screen says "Project not found". A failed read is an error to retry, never a
 * missing project.
 */
export function useProjectLookup(projectId: string): ProjectLookup {
  const { projects, loading, fetching, hasData, error, refetch } = useProjects();
  const project = projects.find((candidate) => candidate.id === projectId);

  const refreshRequested = useRef<string | null>(null);
  const [refreshedFor, setRefreshedFor] = useState<string | null>(null);
  const needsRefresh = !project && hasData && !loading && !fetching && refreshedFor !== projectId;
  useEffect(() => {
    if (!needsRefresh || refreshRequested.current === projectId) return;
    refreshRequested.current = projectId;
    void refetch().finally(() => setRefreshedFor(projectId));
  }, [needsRefresh, projectId, refetch]);

  let state: ProjectLookupState;
  if (project) state = "ready";
  else if (loading || fetching) state = "loading";
  else if (error) state = "error";
  else if (hasData && refreshedFor === projectId) state = "missing";
  else state = "loading";

  return { project, state, error, retry: () => void refetch() };
}
