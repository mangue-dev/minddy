import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface NotificationRow {
  user_id: string;
  project_id: string | null;
  type: "assigned" | "mention" | "comment";
  issue_id: string | null;
  /** Set instead of issue_id when the notification points at an objective. */
  objective_id?: string | null;
  comment_id?: string | null;
  actor_id: string | null;
}

export async function insertNotifications(
  service: SupabaseClient,
  rows: NotificationRow[]
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await service.from("notifications").insert(rows);
  if (error) console.error("[notifications] insert failed:", error.message);
}

/** The set of userIds that can access a project (owner + members). */
export async function projectMemberIds(
  service: SupabaseClient,
  projectId: string
): Promise<Set<string>> {
  const [{ data: proj }, { data: members }] = await Promise.all([
    service.from("projects").select("owner_id").eq("id", projectId).maybeSingle(),
    service.from("project_members").select("user_id").eq("project_id", projectId),
  ]);
  const set = new Set<string>();
  if (proj?.owner_id) set.add(proj.owner_id as string);
  for (const m of members ?? []) set.add(m.user_id as string);
  return set;
}
