import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { newPageMentions, pageBlockTexts } from "@/lib/pages-mentions";
import { toNamed, fetchAuthUsersById } from "@/lib/server/auth-users";
import {
  insertNotifications,
  projectMemberIds,
  type NotificationRow,
} from "@/lib/server/notifications";
import { notificationActorSource } from "@/lib/notification-actor";
import type { Member } from "@/lib/types";

/**
 * Notify people mentioned in a PAGE (MIN-278).
 *
 * The twin of `notifyDescriptionMentions`: same rules, same insertion point
 *, and therefore the same account preferences (the MIN-82 filter lives
 * in `insertNotifications`, where all producers converge). What
 * changes fits in two lines — the target is a page, and it also carries the
 * BLOCK where the citation was placed, so that the click falls on the paragraph.
 *
 * The list of quotables is reconstructed HERE, from `project_members`, and not
 * from what the client sent: warning someone of a page that they cannot
 * would not open would be doing them a disservice, and would make them aware of its existence.
 */
export async function notifyPageMentions(
  service: SupabaseClient,
  params: {
    projectId: string;
    pageId: string;
    /** The author of the writing — never notified of his own citation. */
    actorId: string | null;
    /** The document as it was just written. */
    doc: unknown;
    /** The one before, upon modification. Absent = creation. */
    previousDoc?: unknown;
    /** The writing is an AGENT gesture: the line then names the agent and not
 the account which authorized it (see `actorLabel` below). */
    viaAssistant?: boolean;
    /** The MCP key behind the writing, when it comes from there: it is HIS agent
 that the inbox names — “Claude Code (mcp)”, not “Numo”. */
    mcpKeyId?: string | null;
  },
): Promise<void> {
  // The shortcut for `notifyDescriptionMentions`, and it matters even more here:
  // this path opens with EACH save, so one second after the last one
  // struck. Without an at sign in the document, there is nothing to search for — and two
  // requests (members, then their accounts) not to do.
  if (!pageBlockTexts(params.doc).some((block) => block.text.includes("@"))) {
    return;
  }

  const memberIds = await projectMemberIds(service, params.projectId);
  if (memberIds.size === 0) return;

  const accounts = await fetchAuthUsersById(service, [...memberIds]);
  const members: Member[] = [...memberIds].map(
    (userId) => ({ user_id: userId, ...toNamed(accounts.get(userId)) }) as Member,
  );

  const mentions = newPageMentions({
    members,
    doc: params.doc,
    previousDoc: params.previousDoc,
    actorId: params.actorId,
  });
  if (mentions.length === 0) return;

  // WHO cited, as the line will say — without that, “So-and-so mentioned you”
  // from a sentence that So-and-so never wrote (see `notificationActorSource`).
  const actorSource = notificationActorSource(params);
  const rows: NotificationRow[] = mentions.map((mention) => ({
    user_id: mention.userId,
    project_id: params.projectId,
    type: "page_mention" as const,
    issue_id: null,
    page_id: params.pageId,
    block_id: mention.blockId,
    actor_id: params.actorId,
    ...actorSource,
  }));
  await insertNotifications(service, rows);
}
