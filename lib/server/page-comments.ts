import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  insertNotifications,
  projectMemberIds,
  type NotificationRow,
} from "@/lib/server/notifications";
import { notificationActorSource } from "@/lib/notification-actor";
import { normalizeQuote } from "@/lib/page-comments";

/**
 * PAGE COMMENTS core (MIN-282) — the twin of add-comment.ts, for
 * the fourth surface.
 *
 * What he shares with the other three, word for word: the answers brought back
 * on the ROOT of the wire (depth ≤ 1), access controlled HERE because
 * the writing goes through the client service, and the notifications placed by the
 * common insertion point (lib/server/notifications.ts, where the notification filter lives
 * preferences of MIN-82).
 *
 * What it adds, and which only exists on one page: the ANCHOR (`block_id`) and
 * the frozen extract (`quote`).
 *
 * What he does NOT have either, and that is a choice: the RESOLUTION of a thread. She has
 * meaning on a code review remark — a point to address before
 * merge, and the threads of a pull request already carry it — not on a note
 * left in a doc, which has no deadline to meet. A comment from
 * page is deleted when it no longer exists.
 *
 * What he does NOT have, on purpose: attachments. They hang from a
 * ticket, to an objective or to a return (`attachments_parent_ck`), and a
 * fifth branch for a doc thread was never requested — the document
 * itself already accepts images and files (MIN-280).
 */

export type PageCommentResult =
  | { ok: true; comment: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      /** i18n namespace key `ApiErrors`. */
      errorKey:
        | "commentEmpty"
        | "pageNotFound"
        | "commentNotFound"
        | "databaseError";
    };

/** Same ceiling as the other three wires (MIN-118). */
const MAX_COMMENT_LENGTH = 65_536;

/** What a reading conveys: everything, the line is short and without secrets. */
const COLUMNS = "*";

export async function addPageComment({
  pageId,
  actorId,
  body,
  blockId = null,
  quote = null,
  parentId = null,
  mentionedUserIds = [],
  viaAssistant = false,
  mcpKeyId = null,
}: {
  pageId: string;
  actorId: string;
  body: string;
  /** The anchor: the commented block. Null = a comment on the page. */
  blockId?: string | null;
  /** The extract selected at the time of the comment, frozen with it. */
  quote?: string | null;
  parentId?: string | null;
  mentionedUserIds?: string[];
  viaAssistant?: boolean;
  mcpKeyId?: string | null;
}): Promise<PageCommentResult> {
  const text = body.trim().slice(0, MAX_COMMENT_LENGTH);
  if (!text) return { ok: false, status: 400, errorKey: "commentEmpty" };

  const service = getServiceClient();

  // The page resolves the project for access control, and carries the author that we
  // warns below. Trashed, it is no longer commented on: it is the counterpart
  // of the RLS, which already hides its sons.
  const { data: page } = await service
    .from("pages")
    .select("project_id, created_by")
    .is("deleted_at", null)
    .eq("id", pageId)
    .maybeSingle();
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };

  const projectId = page.project_id as string;
  const access = await getProjectAccess(actorId, projectId);
  if (!access) return { ok: false, status: 404, errorKey: "pageNotFound" };

  // Answers: the stored `parent_id` is ALWAYS the root of the thread, and this
  // root must belong to this page.
  let rootId: string | null = null;
  let rootBlockId: string | null = null;
  const threadAuthorIds: (string | null)[] = [];
  if (parentId) {
    const { data: parent } = await service
      .from("page_comments")
      .select("id, parent_id, page_id, author_id, block_id")
      .eq("id", parentId)
      .maybeSingle();
    if (!parent || parent.page_id !== pageId) {
      return { ok: false, status: 404, errorKey: "commentNotFound" };
    }
    rootId = (parent.parent_id as string | null) ?? (parent.id as string);
    threadAuthorIds.push(parent.author_id as string | null);
    rootBlockId = (parent.block_id as string | null) ?? null;
    if (parent.parent_id) {
      const { data: root } = await service
        .from("page_comments")
        .select("author_id, block_id")
        .eq("id", rootId)
        .maybeSingle();
      threadAuthorIds.push((root?.author_id as string | null) ?? null);
      rootBlockId = (root?.block_id as string | null) ?? null;
    }
  }

  // A RESPONSE has no anchor of its own: it inherits that of its thread. Without
  // this rule, respond from a dialer that knows the current selection
  // would anchor the answer on an OTHER block than the question.
  const anchor = rootId ? rootBlockId : (blockId || null);

  const { data, error } = await service
    .from("page_comments")
    .insert({
      page_id: pageId,
      project_id: projectId,
      block_id: anchor,
      quote: rootId ? null : normalizeQuote(quote),
      body: text,
      author_id: actorId,
      parent_id: rootId,
      via_assistant: viaAssistant,
      via_mcp: !!mcpKeyId,
      api_key_id: mcpKeyId,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    console.error("[page-comments] create failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  // Notifications. Two guys, and they don't say the same thing:
  // - `page_mention`: I was cited. The type of MIN-278, the same one posed
  // a quote in the BODY of the page — same sentence, same destination,
  // and therefore the same preference toggle.
  // - `page_comment`: someone commented on a page that I wrote, or a thread to which
  // I participated. The counterpart of `comment` on a ticket.
  // Never both for the same person: a quote already says it all.
  const valid = await projectMemberIds(service, projectId);
  const mentionSet = new Set(
    mentionedUserIds.filter(
      (uid) => typeof uid === "string" && uid !== actorId && valid.has(uid)
    )
  );
  const commentSet = new Set<string>();
  for (const uid of [...threadAuthorIds, page.created_by] as (string | null)[]) {
    if (uid && uid !== actorId && valid.has(uid) && !mentionSet.has(uid)) {
      commentSet.add(uid);
    }
  }

  const actorSource = notificationActorSource({ viaAssistant, mcpKeyId });
  const target = { page_id: pageId, block_id: anchor };
  const rows: NotificationRow[] = [
    ...[...mentionSet].map((uid) => ({
      user_id: uid,
      project_id: projectId,
      type: "page_mention" as const,
      issue_id: null,
      ...target,
      actor_id: actorId,
      ...actorSource,
    })),
    ...[...commentSet].map((uid) => ({
      user_id: uid,
      project_id: projectId,
      type: "page_comment" as const,
      issue_id: null,
      ...target,
      actor_id: actorId,
      ...actorSource,
    })),
  ];
  await insertNotifications(service, rows);

  return { ok: true, comment: data as Record<string, unknown> };
}

/**
 * The threads of a page, in compact markdown — what an agent reads.
 *
 * Rendered by `minddy_get_page`: an agent who rereads a spec must see the
 * ongoing objections, this is often where the real constraint lies.
 */
export async function openPageThreadsForAgent(
  client: SupabaseClient,
  pageId: string,
  names: (userId: string | null) => string
): Promise<
  {
    thread_id: string;
    quote: string | null;
    block_id: string | null;
    messages: { author: string; body: string; at: string }[];
  }[]
> {
  const { data } = await client
    .from("page_comments")
    .select("id, parent_id, block_id, quote, body, author_id, created_at")
    .eq("page_id", pageId)
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  const roots = rows.filter((r) => !r.parent_id);
  return roots.map((root) => ({
    // The root of the thread: it is SHE that we return to `parent_comment_id` to
    // answer in. Without this id, an agent could only respond to threads
    // that he himself had just opened — those of a human, precisely those
    // which must be answered, had no address.
    thread_id: root.id as string,
    quote: (root.quote as string | null) ?? null,
    block_id: (root.block_id as string | null) ?? null,
    messages: [root, ...rows.filter((r) => r.parent_id === root.id)].map((r) => ({
      author: names(r.author_id as string | null),
      body: r.body as string,
      at: r.created_at as string,
    })),
  }));
}
