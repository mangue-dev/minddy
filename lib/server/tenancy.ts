import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PARTITIONING OF OUTGOING REFERENCES (MIN-339).
 *
 * A ticket does not only carry scalars: it points to a goal, a
 * parent ticket, a duplicate, a cycle, a person. Each of these columns
 * is a bare `uuid` — the base nowhere says that it must denote something from the SAME project, and the write cores (`create-issue`,
 * `update-issue`, `objectives`) turn into service key, RLS bypassed.
 *
 * Hence the rule, only one, applied to all: **a reference is suspicious
 * by default, it must be resolved WITHIN the scope of the ticket, otherwise
 * refused**. Resolving means reading the target line with its pinned `project_id`
 * (or, for a cycle, its owner): a reference that does not emerge from this reading does not exist, from the point of view of the caller.
 *
 * The renderings are intentionally Booleans : it is the caller who knows
 * its error convention (i18n key for routes, bare message for a tool).
 */

/** Does the objective exist, alive, IN this project? */
export async function objectiveInProject(
  service: SupabaseClient,
  objectiveId: string,
  projectId: string
): Promise<boolean> {
  const { data } = await service
    .from("objectives")
    .select("id")
    .eq("id", objectiveId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  return !!data;
}

/** Does the target ticket exist, outside the trash, IN this project? */
export async function issueInProject(
  service: SupabaseClient,
  issueId: string,
  projectId: string
): Promise<boolean> {
  const { data } = await service
    .from("issues")
    .select("id")
    .eq("id", issueId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  return !!data;
}

/**
 * Does this account have access to the project (owner OR member)? Same rule as
 * `getProjectAccess`/`can_access_project`, without the project SELECT when
 * the caller already holds its `owner_id` (the write cores loaded it with
 * their snapshot from before).
 */
export async function userInProject(
  service: SupabaseClient,
  userId: string,
  projectId: string,
  ownerId?: string | null
): Promise<boolean> {
  if (ownerId && ownerId === userId) return true;
  if (ownerId === undefined) {
    const { data: project } = await service
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!project) return false;
    if ((project.owner_id as string) === userId) return true;
  }
  const { data } = await service
    .from("project_members")
    .select("project_id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/**
 * Does this cycle belong to this account? A cycle is PERSONAL — it does not have a
 * project, it has an owner, and storing a ticket there assigns it to this one
 * (MIN-32). It is therefore the only one of the five references whose scope is
 * not the project but the caller itself.
 */
export async function cycleBelongsToUser(
  service: SupabaseClient,
  cycleId: string,
  userId: string
): Promise<boolean> {
  const { data } = await service
    .from("cycles")
    .select("id")
    .eq("id", cycleId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}
