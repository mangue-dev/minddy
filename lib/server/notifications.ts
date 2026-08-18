import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationType } from "@/lib/types";
import {
  categoryOfNotification,
  resolveNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/notification-prefs";
import { afterOrNow } from "@/lib/server/after-safe";
import { isPushConfigured } from "@/lib/server/push/vapid";
import { isApnsConfigured } from "@/lib/server/push/apns";
import { buildPushPayload, loadPushContext } from "@/lib/server/push/payload";
import { sendPushToUser } from "@/lib/server/push/send";

export interface NotificationRow {
  user_id: string;
  project_id: string | null;
  type: NotificationType;
  issue_id: string | null;
  /** Conversation de code visee, qu'elle ait ou non un ticket en contexte. */
  agent_conversation_id?: string | null;
  /** Set instead of issue_id when the notification points at an objective. */
  objective_id?: string | null;
  /** Set instead of issue_id/objective_id for a feedback-post notification. */
  feedback_post_id?: string | null;
  /** Set instead of the three above for a ROUTINE notification (MIN-185) — a
      scheduled run has no ticket, and its executions live in the routine. */
  routine_id?: string | null;
  /** Set instead of all the above for a PULL REQUEST notification: it reads
 on the Pull requests page, and does not necessarily have a ticket. */
  pull_request_id?: string | null;
  /** Set instead of all the above for a PAGE notification (MIN-278) — mention
 in a page, or writing of the agent in it. */
  page_id?: string | null;
  /** The block referred to in this page, when the mention was made: the click
 then falls on the paragraph, not just on the document. */
  block_id?: string | null;
  comment_id?: string | null;
  actor_id: string | null;
  /** The action is taken by the MCP server: the actor displayed in the inbox is
 the AGENT carried by `api_key_id`, not the owner of the key. Same
 vocabulary as `issue_events` (lib/server/issue-events.ts). */
  via_mcp?: boolean;
  /** The action is a gesture from OUR non-MCP agent — the Numo cat, the agent of
 code. The inbox then names Numo, as it already does from a comment
 that he wrote (the flag was read until now on the comment line;
 a quote in a page does not have this shelter, MIN-278). */
  via_assistant?: boolean;
  /** The API key behind an MCP action — its agent/name gives logo and label. */
  api_key_id?: string | null;
  /** The assignment comes from Smart Assign (`actor_id` null): the inbox names the
 feature instead of saying "Someone". */
  via_smart_assign?: boolean;
  /** The line comes from a project automation (MIN-147) — same reason as
 the flag above: without it, the inbox says "Someone". */
  via_automation?: boolean;
}

/** The agent types displace each other: one live agent notification per issue.
 * `routine_done` is one of them: it is the end of the passage of a routine, it
 * replaces the “finished” or “failed” of the previous passage — otherwise
 * a daily routine stacks one line per morning. */
const AGENT_TYPES: readonly NotificationType[] = [
  "agent_done",
  "agent_question",
  "agent_failed",
  "routine_done",
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
    // The LINE, not just its type: a routine borrows the types of
    // the agent, and only its `routine_id` places it under the correct toggle.
    return !prefs || prefs[categoryOfNotification(r)];
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
        del = r.agent_conversation_id
          ? del.eq("agent_conversation_id", r.agent_conversation_id)
          : del.is("agent_conversation_id", null);
        // A ROUTINE notification (MIN-185) has no ticket: without this
        // second filter, the `issue_id is null` above would move the line
        // of ALL routines in the account — two routines fail the same
        // morning would leave only one, and the other would disappear without having
        // been read. Each routine moves its own, and that alone.
        del = r.routine_id ? del.eq("routine_id", r.routine_id) : del.is("routine_id", null);
        // Same reason for a PAGE (MIN-278): without this filter, a write
        // of agent in a page would move the unread line ALL the
        // others. It is this clause that makes an agent who rewrites six pages
        // in a row leaves six lines, and an agent who goes over ten times
        // the same leaves only one.
        del = r.page_id ? del.eq("page_id", r.page_id) : del.is("page_id", null);
        return del;
      })
    );
  }

  const { error } = await service.from("notifications").insert(kept);
  if (error) {
    console.error("[notifications] insert failed:", error.message);
    return;
  }

  // Web Push (MIN-183): the same lines go to system notification, on
  // the devices that the recipient has registered. Here, and not elsewhere, for
  // deux raisons :
  // • this is the ONLY insertion point — thirteen producers converge there, so
  // plug in here covers everything that falls into the inbox, today and
  // tomorrow, without any of them having to know it;
  // • the preferences filter (MIN-82) is already set to `kept`. Only one
  // seesaw governs both surfaces, there is nothing to refilter — and therefore
  // no second filter to keep in phase with the first.
  //
  // After the insert and ONLY if it was successful: a notification that we don't have
  // writing should not ring on a phone leaving the inbox empty.
  //
  // `afterOrNow` is essential: half of the producers shoot outside
  // request (automation cascades, end of agent run, crons). A `void`
  // detached would die with the response, in “TypeError: fetch failed” (cf.
  // lib/server/after-safe.ts).
  pushNotifications(service, kept);
}

/** The push pane of `insertNotifications`, isolated to read alone. Best-effort
 end-to-end: Nothing that follows goes back to the caller. */
function pushNotifications(service: SupabaseClient, kept: NotificationRow[]): void {
  if (!isPushConfigured() && !isApnsConfigured()) return;
  afterOrNow(async () => {
    const ctx = await loadPushContext(service, kept);
    // Sequential by recipient: `sendPushToUser` already parallelizes by
    // device, and an insert is rarely aimed at more than a handful of people.
    for (const row of kept) {
      await sendPushToUser(service, row.user_id, (locale) =>
        buildPushPayload(ctx, row, locale)
      );
    }
  });
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
