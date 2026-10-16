import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Personal project visibility (MIN-692). A hidden project leaves the caller's
 * sidebar and default project lists; access, membership, content and activity
 * stay exactly as they were, for the caller and for everyone else.
 *
 * Every call takes the request's RLS client: the table only ever exposes the
 * caller's own rows, and its insert policy requires access to the project.
 */

export class HiddenProjectsError extends Error {
  constructor(operation: string) {
    super(`hidden_projects ${operation} failed`);
    this.name = "HiddenProjectsError";
  }
}

/** The caller's hidden project ids, oldest first. */
export async function listHiddenProjectIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("hidden_projects")
    .select("project_id")
    .eq("user_id", userId)
    .order("hidden_at", { ascending: true });
  if (error) throw new HiddenProjectsError("list");
  return (data ?? []).map((row) => row.project_id as string);
}

/**
 * Hides or shows one project for the caller. Hiding requires a live project
 * the caller can read (owner or member), so a stranger cannot learn whether
 * an id exists. Showing only deletes the caller's own row and is idempotent.
 */
export async function setProjectHidden(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  hidden: boolean,
): Promise<"ok" | "not_found"> {
  if (!hidden) {
    const { error } = await supabase
      .from("hidden_projects")
      .delete()
      .eq("user_id", userId)
      .eq("project_id", projectId);
    if (error) throw new HiddenProjectsError("delete");
    return "ok";
  }

  // RLS "projects_select" already scopes this read to owner ∪ member.
  const { data: project, error: readError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError) throw new HiddenProjectsError("access");
  if (!project) return "not_found";

  const { error } = await supabase
    .from("hidden_projects")
    .upsert(
      { user_id: userId, project_id: projectId },
      { onConflict: "user_id,project_id", ignoreDuplicates: true },
    );
  if (error) throw new HiddenProjectsError("insert");
  return "ok";
}
