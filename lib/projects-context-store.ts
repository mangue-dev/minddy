"use client";

import { createContext } from "react";
import type { ProjectsContextValue } from "./projects-context";
import type { ProjectRole } from "./project-roles";

/**
 * The project list context, in its own module so shared components can read
 * it without importing the provider (and its wizard) or failing outside it:
 * `useContext(ProjectsContext)` is `null` when no provider is mounted.
 */
export const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export interface ViewerProjectRole {
  role: ProjectRole | undefined;
  canComment: boolean;
}

/**
 * The viewer's role per project id (MIN-693). Separate from the list context
 * and only re-created when a role actually changes, so the many cards and
 * rows that gate on it do not re-render on every project-list refresh.
 */
export const ProjectRolesContext = createContext<ReadonlyMap<string, ViewerProjectRole> | null>(null);
