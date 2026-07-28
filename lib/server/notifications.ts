import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationType } from "@/lib/types";
import {
  categoryOfNotificationType,
  resolveNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/notification-prefs";

export interface NotificationRow {
  user_id: string;
  project_id: string | null;
  type: NotificationType;
  issue_id: string | null;
  /** Set instead of issue_id when the notification points at an objective. */
  objective_id?: string | null;
  /** Set instead of issue_id/objective_id for a feedback-post notification. */
  feedback_post_id?: string | null;
  comment_id?: string | null;
  actor_id: string | null;
  /** L'action est passée par le serveur MCP : l'acteur affiché dans l'inbox est
      l'AGENT porté par `api_key_id`, pas le propriétaire de la clé. Même
      vocabulaire que `issue_events` (lib/server/issue-events.ts). */
  via_mcp?: boolean;
  /** La clé API derrière une action MCP — son agent/nom donne logo et libellé. */
  api_key_id?: string | null;
  /** L'affectation vient de Smart Assign (`actor_id` null) : l'inbox nomme la
      fonctionnalité au lieu de dire « Quelqu'un ». */
  via_smart_assign?: boolean;
}

/** The agent types displace each other: one live agent notification per issue. */
const AGENT_TYPES: readonly NotificationType[] = [
  "agent_done",
  "agent_question",
  "agent_failed",
];

const siblingTypes = (type: NotificationType): readonly NotificationType[] =>
  AGENT_TYPES.includes(type) ? AGENT_TYPES : [type];

export async function insertNotifications(
  service: SupabaseClient,
  rows: NotificationRow[],
  opts: { replaceUnread?: boolean } = {}
): Promise<void> {
  if (rows.length === 0) return;

  // Per-recipient preference filter (MIN-82): a category switched off in the
  // account settings drops the row here, at the single insertion point every
  // producer funnels through. Fail-open — a prefs read error never censors.
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const prefsById = new Map<string, NotificationPrefs>();
  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const { data } = await service.auth.admin.getUserById(uid);
        prefsById.set(
          uid,
          resolveNotificationPrefs(
            (data?.user?.user_metadata ?? null) as Record<string, unknown> | null
          )
        );
      } catch (e) {
        console.error("[notifications] prefs read failed:", (e as Error).message);
      }
    })
  );
  const kept = rows.filter((r) => {
    const prefs = prefsById.get(r.user_id);
    return !prefs || prefs[categoryOfNotificationType(r.type)];
  });
  if (kept.length === 0) return;

  // replaceUnread: the fresh notification displaces its unread predecessor for
  // the same recipient/target (agent runs — a long session must not stack one
  // row per turn). Best-effort: a failed delete only leaves a duplicate.
  if (opts.replaceUnread) {
    await Promise.all(
      kept.map((r) => {
        let del = service
          .from("notifications")
          .delete()
          .eq("user_id", r.user_id)
          .in("type", siblingTypes(r.type) as string[])
          .is("read_at", null);
        del = r.issue_id ? del.eq("issue_id", r.issue_id) : del.is("issue_id", null);
        return del;
      })
    );
  }

  const { error } = await service.from("notifications").insert(kept);
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
