import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { contentMentionScanner } from "@/lib/mention-scan";
import { toNamed, fetchAuthUsersById } from "@/lib/server/auth-users";
import {
  insertNotifications,
  projectMemberIds,
  type NotificationRow,
} from "@/lib/server/notifications";
import { notificationActorSource } from "@/lib/notification-actor";
import type { Member } from "@/lib/types";

/**
 * Who has just been cited, and therefore deserves to be warned - the rule, isolated from the
 * basis to be verifiable as it is.
 *
 * `members` is the list of people who HAVE ACCESS: a name that does not appear there pas
 * is not a mention, and does not notify anyone. `previousDescription` absent
 * = creation, everything mentioned is new.
 */
export function newlyMentionedUserIds(params: {
  members: Member[];
  description: string | null | undefined;
  previousDescription?: string | null;
  actorId: string | null;
}): string[] {
  const scan = contentMentionScanner({ members: params.members });
  const mentionedIn = (text: string | null | undefined): Set<string> => {
    const ids = new Set<string>();
    if (!text) return ids;
    for (const segment of scan(text)) {
      if (segment.mention?.type === "member") ids.add(segment.mention.member.user_id);
    }
    return ids;
  };

  const before = mentionedIn(params.previousDescription);
  return [...mentionedIn(params.description)].filter(
    (userId) => userId !== params.actorId && !before.has(userId),
  );
}

/**
 * Notify people mentioned in a DESCRIPTION (of ticket or objective).
 *
 * Three rules, and the third is the only one that requires a little care:
 *
 * 1. ACCESS. We only cite members of the project — the list of citables is
 * constructed here, from `project_members`, and not from what the client
 * sent. A name that doesn't match anyone here doesn't notify anyone:
 * warning someone about a ticket they can't open would do them a disservice, and would teach them about its existence.
 *
 * 2. NEVER YOURSELF. Quoting yourself in your own description is not an appeal.
 *
 * 3. NEWS ONLY. When editing, we compare the mentions of the
 * PREVIOUS version and we only warn those who have just arrived.
 * Without that, correcting a typo ten lines further down would re-post
 * everyone — and a description is often reread.
 *
 * The rule for what IS a mention is the same as that for the entry field
 * (lib/mention-scan): this is what guarantees that the displayed pill and the
 * person notified refer to the same account.
 */
export async function notifyDescriptionMentions(
  service: SupabaseClient,
  params: {
    projectId: string;
    /** The author of the writing — never notified of his own citation. */
    actorId: string | null;
    /** The description as just written. */
    description: string | null | undefined;
    /** The previous version, upon modification. Absent = creation. */
    previousDescription?: string | null;
    /** The target: one OR the other, like everywhere in `notifications`. */
    issueId?: string;
    objectiveId?: string;
    /** The writing went through the MCP: the inbox names the agent, not the key. */
    mcpKeyId?: string | null;
    /** The writing is a gesture of OUR agent outside MCP (the cat Numo, the code agent
): the inbox and the banner then name Numo. Without that, a
 description rewritten by Numo said "<le demandeur> you mentioned
" — a sentence that the requester did not write. */
    viaAssistant?: boolean;
  },
): Promise<void> {
  const { projectId, actorId, description } = params;
  if (!description || !description.includes("@")) return;

  const memberIds = await projectMemberIds(service, projectId);
  if (memberIds.size === 0) return;

  const accounts = await fetchAuthUsersById(service, [...memberIds]);
  const members: Member[] = [...memberIds].map(
    (userId) => ({ user_id: userId, ...toNamed(accounts.get(userId)) }) as Member,
  );

  const recipients = newlyMentionedUserIds({
    members,
    description,
    previousDescription: params.previousDescription,
    actorId,
  });
  if (recipients.length === 0) return;

  const rows: NotificationRow[] = recipients.map((userId) => ({
    user_id: userId,
    project_id: projectId,
    type: "mention" as const,
    issue_id: params.issueId ?? null,
    objective_id: params.objectiveId ?? null,
    actor_id: actorId,
    ...notificationActorSource(params),
  }));
  await insertNotifications(service, rows);
}
