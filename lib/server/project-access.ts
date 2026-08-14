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
 * Parmi ces projets, ceux auxquels l'utilisateur a ENCORE accès (MIN-351).
 *
 * `getProjectAccess` répond pour un projet et rend la ligne ; celle-ci répond
 * pour un lot et ne rend que des ids. C'est ce dont a besoin une surface qui
 * réhydrate en clé service un ensemble de lignes déjà écrites — l'inbox — et
 * qui doit reposer la question de l'accès au moment de la LECTURE : une
 * notification est un fait passé, l'appartenance au projet ne l'est pas.
 *
 * La corbeille du projet ne compte pas comme une perte d'accès : c'est
 * `getProjectAccess` qui l'écarte, pour une navigation vers un projet qui n'est
 * plus là. Ici on ne fait que décider ce qu'on a le droit de relire.
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
