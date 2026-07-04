import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { Project } from "@/lib/types";

export interface ProjectAccess {
  project: Project;
  isOwner: boolean;
  isMember: boolean;
}

/**
 * Resolve a user's access to a project using the service client (RLS bypassed;
 * the checks live here). Returns null when the project doesn't exist, is deleted,
 * or the user is neither owner nor member — callers turn that into a 404.
 *
 *   isOwner = projects.owner_id === userId
 *   isMember = owner OR a row in project_members  (can_access_project())
 */
export async function getProjectAccess(
  userId: string,
  projectId: string
): Promise<ProjectAccess | null> {
  const supabase = getServiceClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) return null;

  if (project.owner_id === userId) {
    return { project: project as Project, isOwner: true, isMember: true };
  }

  const { data: membership } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) return null;

  return { project: project as Project, isOwner: false, isMember: true };
}
