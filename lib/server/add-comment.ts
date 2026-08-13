import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  insertAttachments,
  parseResourcesInput,
} from "@/lib/server/attachments";
import {
  insertNotifications,
  projectMemberIds,
  type NotificationRow,
} from "@/lib/server/notifications";
import { notificationActorSource } from "@/lib/notification-actor";
import { isCommentVisibility, type CommentVisibility } from "@/lib/feedback/types";

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
      errorKey?:
        | "commentEmpty"
        | "issueNotFound"
        | "objectiveNotFound"
        | "feedbackNotFound"
        | "commentNotFound"
        | "databaseError"
        | "attachmentInvalid";
      /** Verbatim DB message already meant for the user. */
      rawMessage?: string;
    };

// Borne de longueur (MIN-118) : un commentaire est du markdown libre, borné
// comme le plan d'un ticket. Au-delà on tronque — pas de clé d'erreur dédiée.
const MAX_COMMENT_LENGTH = 65_536;

export async function addCommentToIssue({
  issueId,
  actorId,
  body,
  parentId,
  mentionedUserIds,
  attachments,
  viaAssistant = false,
  mcpKeyId = null,
}: {
  issueId: string;
  actorId: string;
  body: string;
  parentId?: string | null;
  mentionedUserIds?: string[];
  /** Files already uploaded to storage by the client — validated here against
      the issue's project prefix before the rows are created. */
  attachments?: unknown;
  /** Marks the comment as posted through Numo (shown as "Numo" in the timeline). */
  viaAssistant?: boolean;
  /** Attributes the comment to an MCP API key (agent actor) — shown as
      "key name (mcp)" in the timeline instead of the user. */
  mcpKeyId?: string | null;
}): Promise<AddCommentResult> {
  const text = body.trim().slice(0, MAX_COMMENT_LENGTH);
  const mentioned = (mentionedUserIds ?? []).filter(
    (v): v is string => typeof v === "string"
  );

  const service = getServiceClient();

  // The issue resolves the project for the access check and carries the
  // owner/assignee we notify below.
  const { data: issue } = await service
    .from("issues")
    .select("project_id, created_by, assignee_id")
    .is("deleted_at", null)
    .eq("id", issueId)
    .maybeSingle();
  if (!issue) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }
  const access = await getProjectAccess(actorId, issue.project_id as string);
  if (!access) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }

  // Validate the attachment descriptors before creating anything: the paths
  // must live under this project's storage prefix.
  const parsedAttachments = parseResourcesInput(
    attachments,
    `projects/${issue.project_id}/`
  );
  if (parsedAttachments === null) {
    return { ok: false, status: 400, errorKey: "attachmentInvalid" };
  }
  // A comment can be attachments-only (screenshot dropped without a word),
  // but never fully empty.
  if (!text && parsedAttachments.length === 0) {
    return { ok: false, status: 400, errorKey: "commentEmpty" };
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

  // The comment exists from here on — an attachment-row failure must not fail
  // the request; the comment just comes back without its files.
  let attachmentRows: Awaited<ReturnType<typeof insertAttachments>> = [];
  try {
    attachmentRows = await insertAttachments(service, {
      projectId: issue.project_id as string,
      issueId,
      commentId: data.id as string,
      createdBy: actorId,
      resources: parsedAttachments,
    });
  } catch (e) {
    console.error("[add-comment] attachments failed:", (e as Error).message);
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

  const actorSource = notificationActorSource({ viaAssistant, mcpKeyId });
  const rows: NotificationRow[] = [
    ...[...mentionSet].map((uid) => ({
      user_id: uid,
      project_id: issue.project_id as string,
      type: "mention" as const,
      issue_id: issueId,
      comment_id: data.id as string,
      actor_id: actorId,
      ...actorSource,
    })),
    ...[...commentSet].map((uid) => ({
      user_id: uid,
      project_id: issue.project_id as string,
      type: "comment" as const,
      issue_id: issueId,
      comment_id: data.id as string,
      actor_id: actorId,
      ...actorSource,
    })),
  ];
  await insertNotifications(service, rows);

  return { ok: true, comment: { ...data, attachments: attachmentRows } };
}

/**
 * Objective-thread twin of addCommentToIssue: same reply-threading and
 * attachment handling, but the parent is an objective. Notifications target the
 * objective's lead + the thread authors + @mentions. Used by
 * POST /api/objectives/[id]/comments and the @Numo objective agent.
 */
export async function addCommentToObjective({
  objectiveId,
  actorId,
  body,
  parentId,
  mentionedUserIds,
  attachments,
  viaAssistant = false,
  mcpKeyId = null,
}: {
  objectiveId: string;
  actorId: string;
  body: string;
  parentId?: string | null;
  mentionedUserIds?: string[];
  attachments?: unknown;
  viaAssistant?: boolean;
  mcpKeyId?: string | null;
}): Promise<AddCommentResult> {
  const text = body.trim().slice(0, MAX_COMMENT_LENGTH);
  const mentioned = (mentionedUserIds ?? []).filter(
    (v): v is string => typeof v === "string"
  );

  const service = getServiceClient();

  // The objective resolves the project for the access check and carries the
  // lead we notify below.
  const { data: objective } = await service
    .from("objectives")
    .select("project_id, lead_user_id")
    .is("deleted_at", null)
    .eq("id", objectiveId)
    .maybeSingle();
  if (!objective) {
    return { ok: false, status: 404, errorKey: "objectiveNotFound" };
  }
  const access = await getProjectAccess(actorId, objective.project_id as string);
  if (!access) {
    return { ok: false, status: 404, errorKey: "objectiveNotFound" };
  }

  const parsedAttachments = parseResourcesInput(
    attachments,
    `projects/${objective.project_id}/`
  );
  if (parsedAttachments === null) {
    return { ok: false, status: 400, errorKey: "attachmentInvalid" };
  }
  if (!text && parsedAttachments.length === 0) {
    return { ok: false, status: 400, errorKey: "commentEmpty" };
  }

  // Replies: the stored parent_id is always the thread's ROOT comment
  // (depth ≤ 1); the parent must belong to this objective.
  let rootId: string | null = null;
  const threadAuthorIds: (string | null)[] = [];
  if (parentId) {
    const { data: parent } = await service
      .from("comments")
      .select("id, parent_id, objective_id, author_id")
      .eq("id", parentId)
      .maybeSingle();
    if (!parent || parent.objective_id !== objectiveId) {
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
      objective_id: objectiveId,
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
    console.error("[add-comment] objective create failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  let attachmentRows: Awaited<ReturnType<typeof insertAttachments>> = [];
  try {
    attachmentRows = await insertAttachments(service, {
      projectId: objective.project_id as string,
      objectiveId,
      commentId: data.id as string,
      createdBy: actorId,
      resources: parsedAttachments,
    });
  } catch (e) {
    console.error("[add-comment] objective attachments failed:", (e as Error).message);
  }

  // Notifications: @mentions + the objective's lead + the thread authors —
  // never the requester themself, members only.
  const valid = await projectMemberIds(service, objective.project_id as string);

  const mentionSet = new Set(
    mentioned.filter((uid) => uid !== actorId && valid.has(uid))
  );
  const commentSet = new Set<string>();
  for (const uid of [
    ...threadAuthorIds,
    objective.lead_user_id,
  ] as (string | null)[]) {
    if (uid && uid !== actorId && valid.has(uid) && !mentionSet.has(uid)) {
      commentSet.add(uid);
    }
  }

  const actorSource = notificationActorSource({ viaAssistant, mcpKeyId });
  const rows: NotificationRow[] = [
    ...[...mentionSet].map((uid) => ({
      user_id: uid,
      project_id: objective.project_id as string,
      type: "mention" as const,
      issue_id: null,
      objective_id: objectiveId,
      comment_id: data.id as string,
      actor_id: actorId,
      ...actorSource,
    })),
    ...[...commentSet].map((uid) => ({
      user_id: uid,
      project_id: objective.project_id as string,
      type: "comment" as const,
      issue_id: null,
      objective_id: objectiveId,
      comment_id: data.id as string,
      actor_id: actorId,
      ...actorSource,
    })),
  ];
  await insertNotifications(service, rows);

  return { ok: true, comment: { ...data, attachments: attachmentRows } };
}

/**
 * Feedback-thread twin of addCommentToIssue: same reply-threading and
 * attachment handling, but the parent is a feedback post. Feedback is RLS
 * deny-all, so access is checked HERE (via the post's project) and the write
 * uses the service client — the feedback convention. Notifications target
 * @mentions + the thread authors (a feedback post has no owner/assignee).
 * Used by POST /api/projects/[id]/feedback/[postId]/comments and the @Numo
 * feedback agent.
 *
 * `visibility` (MIN-196) decides who reads it. `internal` — the default, and
 * everything written before MIN-196 — stays team-only. `public` publishes it on
 * the board as the TEAM's voice: it is signed "<project> team" there, never with
 * the author's name, which is why the member still owns the row (`author_id`)
 * but the board never reads it. A public comment carries no @mentions either:
 * it is addressed to whoever wrote the request, not to a colleague.
 */
export async function addCommentToFeedbackPost({
  postId,
  actorId,
  body,
  parentId,
  mentionedUserIds,
  attachments,
  viaAssistant = false,
  mcpKeyId = null,
  visibility = "internal",
}: {
  postId: string;
  actorId: string;
  body: string;
  parentId?: string | null;
  mentionedUserIds?: string[];
  attachments?: unknown;
  viaAssistant?: boolean;
  mcpKeyId?: string | null;
  visibility?: CommentVisibility;
}): Promise<AddCommentResult> {
  // La visibilité EFFECTIVE. Sur un commentaire racine, c'est celle qu'on
  // demande ; sur une réponse, c'est celle du fil, quoi qu'on ait demandé —
  // voir plus bas. Un fil ne peut pas être public à moitié.
  let effectiveVisibility: CommentVisibility = visibility;
  const text = body.trim().slice(0, MAX_COMMENT_LENGTH);
  const mentioned = (mentionedUserIds ?? []).filter(
    (v): v is string => typeof v === "string"
  );

  const service = getServiceClient();

  // The post resolves the project for the access check.
  const { data: post } = await service
    .from("feedback_posts")
    .select("project_id")
    .is("deleted_at", null)
    .eq("id", postId)
    .maybeSingle();
  if (!post) {
    return { ok: false, status: 404, errorKey: "feedbackNotFound" };
  }
  const access = await getProjectAccess(actorId, post.project_id as string);
  if (!access) {
    return { ok: false, status: 404, errorKey: "feedbackNotFound" };
  }

  const parsedAttachments = parseResourcesInput(
    attachments,
    `projects/${post.project_id}/`
  );
  if (parsedAttachments === null) {
    return { ok: false, status: 400, errorKey: "attachmentInvalid" };
  }
  if (!text && parsedAttachments.length === 0) {
    return { ok: false, status: 400, errorKey: "commentEmpty" };
  }

  // Replies: the stored parent_id is always the thread's ROOT comment
  // (depth ≤ 1); the parent must belong to this feedback post.
  //
  // A reply INHERITS its thread's visibility, whatever the caller asked for. A
  // thread cannot be half public — answering a board comment is answering ON the
  // board, and answering under a team note stays internal. Deriving it here
  // rather than trusting the caller also means no UI can publish by accident:
  // there is exactly one place that decides, and it reads the parent.
  let rootId: string | null = null;
  const threadAuthorIds: (string | null)[] = [];
  if (parentId) {
    const { data: parent } = await service
      .from("comments")
      .select("id, parent_id, feedback_post_id, author_id, visibility")
      .eq("id", parentId)
      .maybeSingle();
    if (!parent || parent.feedback_post_id !== postId) {
      return { ok: false, status: 404, errorKey: "commentNotFound" };
    }
    effectiveVisibility = isCommentVisibility(parent.visibility)
      ? parent.visibility
      : "internal";
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
      feedback_post_id: postId,
      author_id: actorId,
      body: text,
      parent_id: rootId,
      via_assistant: viaAssistant,
      via_mcp: !!mcpKeyId,
      api_key_id: mcpKeyId,
      visibility: effectiveVisibility,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[add-comment] feedback create failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  let attachmentRows: Awaited<ReturnType<typeof insertAttachments>> = [];
  try {
    attachmentRows = await insertAttachments(service, {
      projectId: post.project_id as string,
      feedbackPostId: postId,
      commentId: data.id as string,
      createdBy: actorId,
      resources: parsedAttachments,
    });
  } catch (e) {
    console.error("[add-comment] feedback attachments failed:", (e as Error).message);
  }

  // Notifications: @mentions + the thread authors — never the requester
  // themself, members only. (A feedback post has no owner/assignee/lead.)
  // A public reply carries no mention: it is addressed to the person who wrote
  // the request, and an "@" typed in it is text the board will print verbatim.
  const valid = await projectMemberIds(service, post.project_id as string);

  const mentionSet = new Set(
    effectiveVisibility === "public"
      ? []
      : mentioned.filter((uid) => uid !== actorId && valid.has(uid))
  );
  const commentSet = new Set<string>();
  for (const uid of threadAuthorIds) {
    if (uid && uid !== actorId && valid.has(uid) && !mentionSet.has(uid)) {
      commentSet.add(uid);
    }
  }

  const actorSource = notificationActorSource({ viaAssistant, mcpKeyId });
  const rows: NotificationRow[] = [
    ...[...mentionSet].map((uid) => ({
      user_id: uid,
      project_id: post.project_id as string,
      type: "mention" as const,
      issue_id: null,
      feedback_post_id: postId,
      comment_id: data.id as string,
      actor_id: actorId,
      ...actorSource,
    })),
    ...[...commentSet].map((uid) => ({
      user_id: uid,
      project_id: post.project_id as string,
      type: "comment" as const,
      issue_id: null,
      feedback_post_id: postId,
      comment_id: data.id as string,
      actor_id: actorId,
      ...actorSource,
    })),
  ];
  await insertNotifications(service, rows);

  return { ok: true, comment: { ...data, attachments: attachmentRows } };
}
