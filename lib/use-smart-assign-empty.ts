"use client";

import { useContext } from "react";
import { ProjectsContext } from "@/lib/projects-context-store";
import { smartAssignFillsEmptyAssignee } from "@/lib/smart-assign-config";

/**
 * {@link smartAssignFillsEmptyAssignee} for an issue of a project the viewer
 * belongs to, read from the project list: whether its empty assignee reads
 * "Smart Assign" rather than "Unassigned" (MIN-811). `false` outside the
 * project list provider.
 */
export function useSmartAssignFillsEmpty(
  projectId: string | null | undefined,
  status: string | null | undefined,
): boolean {
  const enabled = useContext(ProjectsContext)?.projects.find((project) => project.id === projectId)
    ?.smart_assign_enabled;
  return smartAssignFillsEmptyAssignee(enabled, status);
}
