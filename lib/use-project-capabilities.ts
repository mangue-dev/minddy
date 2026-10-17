"use client";

import { useContext, useMemo } from "react";
import { ProjectRolesContext } from "./projects-context-store";
import {
  projectCapabilities,
  type ProjectCapabilities,
} from "./project-roles";
import type { Project } from "./types";

/**
 * The viewer's capabilities in a project (MIN-693), for UI gating only: the
 * server stays the authority on every write.
 *
 * The role comes from `Project.my_role` (project list and bootstrap reads).
 * While it is absent, the viewer is the owner when their id matches
 * `owner_id`, otherwise a member: a missing field must never restrict what
 * worked before roles existed, and the server rejects reader writes anyway.
 */
export function capabilitiesForProject(
  project: Pick<Project, "owner_id" | "my_role" | "my_can_comment"> | null | undefined,
  userId: string | null | undefined
): ProjectCapabilities {
  if (!project) return projectCapabilities("member");
  if (project.my_role) {
    return projectCapabilities(project.my_role, project.my_can_comment === true);
  }
  if (userId && project.owner_id === userId) return projectCapabilities("owner");
  return projectCapabilities("member");
}

/**
 * Capabilities in `projectId`, for gating writes in the UI.
 *
 * Without `my_role` (or outside the projects provider) the viewer is treated
 * as a member: write access is never withheld before the data says so. Only
 * `canWrite` and `canComment` are meant for gating here; administration keeps
 * its existing owner checks (`owner_id`, `MembersResponse.isOwner`).
 */
export function useProjectCapabilities(
  projectId: string | null | undefined
): ProjectCapabilities {
  const roles = useContext(ProjectRolesContext);
  const entry = projectId ? roles?.get(projectId) : undefined;
  const myRole = entry?.role;
  const myCanComment = entry?.canComment === true;
  return useMemo(
    () => projectCapabilities(myRole ?? "member", myCanComment),
    [myRole, myCanComment]
  );
}
