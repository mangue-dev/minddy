import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  insertNotifications,
  projectMemberIds,
  type NotificationRow,
} from "@/lib/server/notifications";

/**
 * Shared comment-creation core: normalizes replies onto their thread's ROOT
 * comment (depth ≤ 1), inserts via the service client and fans out the
 * mention / comment notifications. Used by POST /api/issues/[id]/comments
 * and the assistant tools.
 *
 * Access is enforced HERE (the write bypasses RLS): the actor must be able to
 * access the issue's project, otherwise the issue is reported as not found —
 * the same signal RLS invisibility gives.
 */
export type AddCommentResult =
  | { ok: true; comment: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      /** Key into the ApiErrors i18n namespace (mutually exclusive with rawMessage). */
      errorKey?: "commentEmpty" | "issueNotFound" | "commentNotFound" | "databaseError";
      /** Verbatim DB message already meant for the user. */
      rawMessage?: string;
    };

export async function addCommentToIssue({
  issueId,
  actorId,
  body,
  parentId,
  mentionedUserIds,
  viaAssistant = false,
  mcpKeyId = null,
}: {
  issueId: string;
  actorId: string;
  body: string;
  parentId?: string | null;
  mentionedUserIds?: string[];
  /** Marks the comment as posted through Numo (shown as "Numo" in the timeline). */
  viaAssistant?: boolean;
  /** Attributes the comment to an MCP API key (agent actor) — shown as
      "key name (mcp)" in the timeline instead of the user. */
  mcpKeyId?: string | null;
}): Promise<AddCommentResult> {
  const text = body.trim();
  if (!text) {
    return { ok: false, status: 400, errorKey: "commentEmpty" };
  }
  const mentioned = (mentionedUserIds ?? []).filter(
    (v): v is string => typeof v === "string"
  );

  const service = getServiceClient();

  // The issue resolves the project for the access check and carries the
  // owner/assignee we notify below.
  const { data: issue } = await service
    .from("issues")
    .select("project_id, created_by, assignee_id")
    .eq("id", issueId)
    .maybeSingle();
  if (!issue) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }
  const access = await getProjectAccess(actorId, issue.project_id as string);
  if (!access) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }

  // Replies: the stored parent_id is always the thread's ROOT comment
  // (depth ≤ 1); the parent must belong to this issue.
  let rootId: string | null = null;
  const threadAuthorIds: (string | null)[] = [];
  if (parentId) {
    const { data: parent } = await service
      .from("comments")
      .select("id, parent_id, issue_id, author_id")
      .eq("id", parentId)
      .maybeSingle();
    if (!parent || parent.issue_id !== issueId) {
      return { ok: false, status: 404, errorKey: "commentNotFound" };
    }
    rootId = (parent.parent_id as string | null) ?? (parent.id as string);
    threadAuthorIds.push(parent.author_id as string | null);
    if (parent.parent_id) {
      const { data: root } = await service
        .from("comments")
        .select("author_id")
        .eq("id", rootId)
        .maybeSingle();
      threadAuthorIds.push((root?.author_id as string | null) ?? null);
    }
  }

  const { data, error } = await service
    .from("comments")
    .insert({
      issue_id: issueId,
      author_id: actorId,
      body: text,
      parent_id: rootId,
      via_assistant: viaAssistant,
      via_mcp: !!mcpKeyId,
      api_key_id: mcpKeyId,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[add-comment] create failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  // Notifications: @mentions + "comment on an issue I own/am assigned" +
  // reply on a thread I authored (root or direct parent).
  const valid = await projectMemberIds(service, issue.project_id as string);

  const mentionSet = new Set(
    mentioned.filter((uid) => uid !== actorId && valid.has(uid))
  );
  const commentSet = new Set<string>();
  for (const uid of [
    ...threadAuthorIds,
    issue.created_by,
    issue.assignee_id,
  ] as (string | null)[]) {
    if (uid && uid !== actorId && valid.has(uid) && !mentionSet.has(uid)) {
      commentSet.add(uid);
    }
  }

  const rows: NotificationRow[] = [
    ...[...mentionSet].map((uid) => ({
      user_id: uid,
      project_id: issue.project_id as string,
      type: "mention" as const,
      issue_id: issueId,
      comment_id: data.id as string,
      actor_id: actorId,
    })),
    ...[...commentSet].map((uid) => ({
      user_id: uid,
      project_id: issue.project_id as string,
      type: "comment" as const,
      issue_id: issueId,
      comment_id: data.id as string,
      actor_id: actorId,
    })),
  ];
  await insertNotifications(service, rows);

  return { ok: true, comment: data };
}
