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
/**
 * Among these projects, those to which the user STILL has access (MIN-351).
 *
 * `getProjectAccess` responds for a project and returns the line; this one responds
 * for a batch and only returns ids. This is what a surface needs which
 * rehydrates into a service key a set of lines already written - the inbox - and
 * which must raise the question of access at the time of READING: a
 * notification is a past fact, membership in the project is not.
 *
 * The project trash does not count as a loss of access: it is
 * `getProjectAccess` that removes it, for navigation to a project that is no longer there. Here we just decide what we have the right to reread.
 */
export async function accessibleProjectIds(
  userId: string,
  projectIds: readonly string[]
): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set();
  const supabase = getServiceClient();

  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase
      .from("projects")
      .select("id")
      .in("id", projectIds as string[])
      .eq("owner_id", userId),
    supabase
      .from("project_members")
      .select("project_id")
      .in("project_id", projectIds as string[])
      .eq("user_id", userId),
  ]);

  return new Set([
    ...(owned ?? []).map((p) => p.id as string),
    ...(memberships ?? []).map((m) => m.project_id as string),
  ]);
}

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
