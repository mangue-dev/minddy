import { objectiveStore } from "@/lib/server/objective-store";
import { commentStore } from "@/lib/server/comment-store";
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AssistantPageContext,
  NumoIntentAction,
  NumoIntentSource,
} from "@/lib/assistant-types";
import { displayName } from "@/lib/display-name";
import { issueIdentifier } from "@/lib/issue-constants";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { getProjectAccess } from "@/lib/server/project-access";
import { hasUsageBudget } from "@/lib/server/usage";
import type { PromptAttachment } from "./attachment-parts";
import {
  groupPromptAttachments,
  PROMPT_ATTACHMENT_COLUMNS,
} from "./attachment-parts";
import { commentDisplay, type CommentDisplay } from "./comment-live";
import { startNumoIntent } from "@/lib/server/numo/start-intent";
import { executeNumoTurn } from "@/lib/server/numo/turns";
import { answerNumoWorkerInput } from "@/lib/server/numo/worker-mediation";
import {
  bindNumoSurfaceEvent,
  ensureNumoSurfaceThread,
  failNumoSurfaceEvent,
  pendingSurfaceWorkerInput,
  reserveNumoSurfaceEvent,
  setNumoSurfaceEventResponse,
  type NumoSurface,
  type NumoSurfaceDestination,
} from "@/lib/server/numo/surface-conversations";

export function mentionsNumo(body: string): boolean {
  return /(^|[\s(>])@numo\b/i.test(body);
}

export function numoCommentNotificationTargets(
  requesterId: string,
  memberIds: Set<string>,
  candidates: Array<string | null | undefined>,
): string[] {
  const targets = new Set<string>();
  for (const userId of candidates) {
    if (userId && userId !== requesterId && memberIds.has(userId)) {
      targets.add(userId);
    }
  }
  return [...targets];
}

async function replyTargetsNumoInTable(input: {
  service: SupabaseClient;
  table: "comments" | "page_comments";
  scopeColumn: "issue_id" | "objective_id" | "feedback_post_id" | "page_id";
  comment: { id: string; parent_id: string | null } & Record<string, unknown>;
}): Promise<boolean> {
  if (!input.comment.parent_id) return false;
  const { data: last } = await commentStore(input.service, input.table)
    .select("via_assistant, assistant_status")
    .eq(input.scopeColumn, input.comment[input.scopeColumn])
    .or(`id.eq.${input.comment.parent_id},parent_id.eq.${input.comment.parent_id}`)
    .neq("id", input.comment.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return !!last?.via_assistant && last.assistant_status !== "working";
}

export async function replyTargetsNumo(
  service: SupabaseClient,
  comment: { id: string; issue_id: string; parent_id: string | null },
): Promise<boolean> {
  return replyTargetsNumoInTable({
    service,
    table: "comments",
    scopeColumn: "issue_id",
    comment,
  });
}

export async function replyTargetsNumoObjective(
  service: SupabaseClient,
  comment: { id: string; objective_id: string; parent_id: string | null },
): Promise<boolean> {
  return replyTargetsNumoInTable({
    service,
    table: "comments",
    scopeColumn: "objective_id",
    comment,
  });
}

export async function replyTargetsNumoFeedback(
  service: SupabaseClient,
  comment: { id: string; feedback_post_id: string; parent_id: string | null },
): Promise<boolean> {
  return replyTargetsNumoInTable({
    service,
    table: "comments",
    scopeColumn: "feedback_post_id",
    comment,
  });
}

export async function replyTargetsNumoPage(
  service: SupabaseClient,
  comment: { id: string; page_id: string; parent_id: string | null },
): Promise<boolean> {
  return replyTargetsNumoInTable({
    service,
    table: "page_comments",
    scopeColumn: "page_id",
    comment,
  });
}

type SharedThreadEntry = {
  author: string;
  body: string;
  attachments?: string[];
  audience?: string;
};

function sharedSurfacePrompt(input: {
  author: string;
  trigger: "mention" | "reply";
  target: string;
  body: string;
  thread: SharedThreadEntry[];
}): string {
  const transcript = input.thread.map((entry) => {
    const attachments = entry.attachments?.length
      ? `\nAttachments: ${entry.attachments.join(", ")}`
      : "";
    return `${entry.author}${entry.audience ? ` (${entry.audience})` : ""}:\n${entry.body}${attachments}`;
  }).join("\n\n");
  return `[Shared comment request]
${input.author} ${input.trigger === "reply" ? "replied to Numo" : "mentioned Numo"} on ${input.target}.

${input.body}

[Recent shared thread]
${transcript || "No earlier messages."}

[Response boundary]
Your final answer is projected back into this shared thread. Answer the request directly and include only information intended for every reader of that surface. The canonical conversation, reasoning, tool results, personal connector data, credentials, and other private context are not shared automatically. Do not reveal them merely because they are available in your private working context. If essential input is missing, ask the minimum blocking question with ask_user; a later reply in this thread resumes the same durable work.`;
}

async function actorNames(
  service: SupabaseClient,
  actorId: string,
  rows: Array<{ author_id?: unknown }>,
) {
  const authorIds = rows.flatMap((row) =>
    typeof row.author_id === "string" ? [row.author_id] : [],
  );
  const users = await fetchAuthUsersById(service, [...authorIds, actorId]);
  return {
    users,
    name(id: string | null, viaAssistant?: boolean) {
      return viaAssistant
        ? "Numo"
        : displayName(toNamed(id ? users.get(id) : null), "User");
    },
  };
}

async function runSharedSurfaceMention(input: {
  supabase: SupabaseClient;
  service: SupabaseClient;
  surface: NumoSurface;
  sourceThreadId: string;
  sourceEventId: string;
  actorId: string;
  actorMetadata?: Record<string, unknown> | null;
  projectId: string;
  title: string;
  prompt: string;
  answer: string;
  locale: string;
  source: NumoIntentSource;
  action?: NumoIntentAction;
  context: AssistantPageContext;
  attachments?: PromptAttachment[];
  destination: NumoSurfaceDestination;
  createResponse: () => Promise<{ id: string; display: CommentDisplay }>;
}): Promise<void> {
  let display: CommentDisplay | null = null;
  let eventId: string | null = null;
  try {
    const thread = await ensureNumoSurfaceThread({
      service: input.service,
      surface: input.surface,
      sourceThreadId: input.sourceThreadId,
      actorId: input.actorId,
      projectId: input.projectId,
      title: input.title,
    });
    const reserved = await reserveNumoSurfaceEvent({
      service: input.service,
      threadId: thread.id,
      sourceEventId: input.sourceEventId,
      actorId: input.actorId,
      destination: input.destination,
    });
    if (!reserved.created) return;
    eventId = reserved.event.id;

    const response = await input.createResponse();
    display = response.display;
    await setNumoSurfaceEventResponse({
      service: input.service,
      eventId,
      responseId: response.id,
    });

    const pendingInput = await pendingSurfaceWorkerInput(
      input.service,
      thread.conversation_id,
    );
    if (pendingInput) {
      const disposition = await answerNumoWorkerInput({
        conversationId: thread.conversation_id,
        userId: input.actorId,
        correlation: {
          parentTurnId: pendingInput.turnId,
          runId: pendingInput.runId,
          questionId: pendingInput.questionId,
        },
        answer: input.answer,
        messageId: eventId,
        persistParentMessage: true,
      });
      if (disposition.action === "answered" || disposition.action === "already") {
        await bindNumoSurfaceEvent({
          service: input.service,
          eventId,
          turnId: pendingInput.turnId,
        });
        return;
      }
      const reason = disposition.action === "refused"
        ? disposition.reason
        : disposition.action;
      throw new Error(`Unable to resume surface worker input: ${reason}`);
    }

    const started = await startNumoIntent({
      supabase: input.supabase,
      userId: input.actorId,
      userMetadata: input.actorMetadata,
      projectId: input.projectId,
      prompt: input.prompt,
      locale: input.locale,
      source: input.source,
      action: input.action ?? "discuss",
      context: input.context,
      attachments: input.attachments,
      conversationId: thread.conversation_id,
      requestId: eventId,
      executeInBackground: false,
      triggerSource: "mention",
    });
    await bindNumoSurfaceEvent({
      service: input.service,
      eventId,
      turnId: started.turnId,
    });
    await executeNumoTurn({
      turnId: started.turnId,
      readClient: input.supabase,
    });
  } catch (error) {
    console.error(`[numo-surface] ${input.surface} failed:`, error);
    await display?.fail();
    if (eventId) await failNumoSurfaceEvent(input.service, eventId);
  }
}

export async function runCommentMention(input: {
  supabase: SupabaseClient;
  service: SupabaseClient;
  issueId: string;
  actorId: string;
  triggerCommentId: string;
  locale: string;
  trigger?: "mention" | "reply";
}): Promise<void> {
  const { service, actorId, issueId, triggerCommentId } = input;
  const { data: issue } = await service
    .from("issues")
    .select("id, project_id, number, title, created_by, assignee_id")
    .eq("id", issueId)
    .is("deleted_at", null)
    .maybeSingle();
  const access = issue
    ? await getProjectAccess(actorId, issue.project_id as string)
    : null;
  if (!issue || !access || !await hasUsageBudget(actorId, "assistant", "assistant_model")) return;

  const { data: triggerRow } = await commentStore(service, "comments", actorId)
    .select("id, parent_id, body, author_id")
    .eq("id", triggerCommentId).eq("issue_id", issueId)
    .maybeSingle();
  if (!triggerRow) return;
  const rootId = (triggerRow.parent_id as string | null) ?? triggerRow.id as string;

  const [{ data: comments, error: commentsError }, { data: attachments }, { data: root, error: rootError }] = await Promise.all([
    commentStore(service, "comments", actorId)
      .select("id, author_id, body, via_assistant, created_at")
      .eq("issue_id", issueId)
      .or(`id.eq.${rootId},parent_id.eq.${rootId}`)
      .order("created_at", { ascending: false })
      .limit(20),
    service.from("attachments")
      .select(PROMPT_ATTACHMENT_COLUMNS)
      .eq("issue_id", issueId)
      .order("created_at", { ascending: true }),
    commentStore(service, "comments", actorId).select("author_id").eq("id", rootId).eq("issue_id", issueId).maybeSingle(),
  ]);
  if (commentsError || rootError) throw new Error("Unable to read assistant comment context");
  const rows = [...(comments ?? [])].reverse();
  const names = await actorNames(service, actorId, rows);
  const grouped = groupPromptAttachments(attachments);
  const identifier = issueIdentifier(access.project.key, issue.number as number);
  const thread = rows.map((row) => ({
    author: names.name(row.author_id as string | null, !!row.via_assistant),
    body: (row.body as string | null) ?? "",
    attachments: grouped.get(row.id as string)?.map((attachment) => attachment.file_name),
  }));
  const destination: NumoSurfaceDestination = {
    kind: "comment",
    table: "comments",
    locale: input.locale,
    notification: {
      type: "comment",
      candidateUserIds: [root?.author_id, issue.created_by, issue.assignee_id],
      issueId,
    },
  };
  await runSharedSurfaceMention({
    ...input,
    surface: "issue_comment",
    sourceThreadId: rootId,
    sourceEventId: triggerCommentId,
    actorMetadata: names.users.get(actorId)?.user_metadata,
    projectId: issue.project_id as string,
    title: `${identifier}: ${issue.title as string}`,
    prompt: sharedSurfacePrompt({
      author: names.name(actorId),
      trigger: input.trigger ?? "mention",
      target: `${identifier} “${issue.title as string}”`,
      body: triggerRow.body as string,
      thread,
    }),
    answer: triggerRow.body as string,
    source: "issue",
    context: {
      projectId: issue.project_id as string,
      issueId,
      issueIdentifier: identifier,
      issueTitle: issue.title as string,
    },
    attachments: [
      ...(grouped.get(triggerCommentId) ?? []),
      ...(grouped.get(null) ?? []),
    ].slice(0, 5),
    destination,
    createResponse: async () => {
      const { data, error } = await commentStore(service, "comments", actorId).insert({
        issue_id: issueId,
        author_id: actorId,
        parent_id: rootId,
        body: "",
        via_assistant: true,
        assistant_status: "working",
      }).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Unable to create response");
      return { id: data.id as string, display: commentDisplay(service, data.id as string) };
    },
  });
}

export async function runObjectiveCommentMention(input: {
  supabase: SupabaseClient;
  service: SupabaseClient;
  objectiveId: string;
  actorId: string;
  triggerCommentId: string;
  locale: string;
  trigger?: "mention" | "reply";
}): Promise<void> {
  const { service, actorId, objectiveId, triggerCommentId } = input;
  const { data: target } = await objectiveStore(service)
    .select("id, project_id, lead_user_id").eq("id", objectiveId)
    .is("deleted_at", null).maybeSingle();
  if (
    !target
    || !await getProjectAccess(actorId, target.project_id as string)
    || !await hasUsageBudget(actorId, "assistant", "assistant_model")
  ) return;
  const { data: objective, error: objectiveError } = await objectiveStore(service, actorId)
    .select("id, project_id, name, lead_user_id").eq("id", objectiveId)
    .eq("project_id", target.project_id as string).is("deleted_at", null).maybeSingle();
  if (objectiveError) throw new Error("Unable to read objective context");
  if (!objective) return;
  const { data: triggerRow } = await commentStore(service, "comments", actorId)
    .select("id, parent_id, body, author_id").eq("id", triggerCommentId).eq("objective_id", objectiveId).maybeSingle();
  if (!triggerRow) return;
  const rootId = (triggerRow.parent_id as string | null) ?? triggerRow.id as string;

  const [{ data: comments, error: commentsError }, { data: attachments }, { data: root, error: rootError }] = await Promise.all([
    commentStore(service, "comments", actorId).select("id, author_id, body, via_assistant, created_at")
      .eq("objective_id", objectiveId).or(`id.eq.${rootId},parent_id.eq.${rootId}`)
      .order("created_at", { ascending: false }).limit(20),
    service.from("attachments").select(PROMPT_ATTACHMENT_COLUMNS)
      .eq("objective_id", objectiveId).order("created_at", { ascending: true }),
    commentStore(service, "comments", actorId).select("author_id").eq("id", rootId).eq("objective_id", objectiveId).maybeSingle(),
  ]);
  if (commentsError || rootError) throw new Error("Unable to read assistant comment context");
  const rows = [...(comments ?? [])].reverse();
  const names = await actorNames(service, actorId, rows);
  const grouped = groupPromptAttachments(attachments);
  const thread = rows.map((row) => ({
    author: names.name(row.author_id as string | null, !!row.via_assistant),
    body: (row.body as string | null) ?? "",
    attachments: grouped.get(row.id as string)?.map((attachment) => attachment.file_name),
  }));
  await runSharedSurfaceMention({
    ...input,
    surface: "objective_comment",
    sourceThreadId: rootId,
    sourceEventId: triggerCommentId,
    actorMetadata: names.users.get(actorId)?.user_metadata,
    projectId: objective.project_id as string,
    title: `Objective: ${objective.name as string}`,
    prompt: sharedSurfacePrompt({
      author: names.name(actorId),
      trigger: input.trigger ?? "mention",
      target: `the objective “${objective.name as string}”`,
      body: triggerRow.body as string,
      thread,
    }),
    answer: triggerRow.body as string,
    source: "objective",
    context: {
      projectId: objective.project_id as string,
      objectiveId,
      objectiveName: objective.name as string,
    },
    attachments: [
      ...(grouped.get(triggerCommentId) ?? []),
      ...(grouped.get(null) ?? []),
    ].slice(0, 5),
    destination: {
      kind: "comment",
      table: "comments",
      locale: input.locale,
      notification: {
        type: "comment",
        candidateUserIds: [root?.author_id, objective.lead_user_id],
        objectiveId,
      },
    },
    createResponse: async () => {
      const { data, error } = await commentStore(service, "comments", actorId).insert({
        objective_id: objectiveId,
        author_id: actorId,
        parent_id: rootId,
        body: "",
        via_assistant: true,
        assistant_status: "working",
      }).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Unable to create response");
      return { id: data.id as string, display: commentDisplay(service, data.id as string) };
    },
  });
}

export async function runPageCommentMention(input: {
  supabase: SupabaseClient;
  service: SupabaseClient;
  pageId: string;
  actorId: string;
  triggerCommentId: string;
  locale: string;
  trigger?: "mention" | "reply";
}): Promise<void> {
  const { service, actorId, pageId, triggerCommentId } = input;
  const { data: page } = await service.from("pages")
    .select("id, project_id, title, created_by").eq("id", pageId)
    .is("deleted_at", null).maybeSingle();
  if (
    !page
    || !await getProjectAccess(actorId, page.project_id as string)
    || !await hasUsageBudget(actorId, "assistant", "assistant_model")
  ) return;
  const { data: triggerRow } = await commentStore(service, "page_comments", actorId)
    .select("id, parent_id, body, author_id, block_id")
    .eq("id", triggerCommentId).eq("page_id", pageId).maybeSingle();
  if (!triggerRow) return;
  const rootId = (triggerRow.parent_id as string | null) ?? triggerRow.id as string;

  const [{ data: comments, error: commentsError }, { data: root, error: rootError }] = await Promise.all([
    commentStore(service, "page_comments", actorId).select("id, author_id, body, via_assistant, created_at")
      .eq("page_id", pageId).or(`id.eq.${rootId},parent_id.eq.${rootId}`)
      .order("created_at", { ascending: false }).limit(20),
    commentStore(service, "page_comments", actorId).select("author_id, quote").eq("id", rootId).eq("page_id", pageId).maybeSingle(),
  ]);
  if (commentsError || rootError) throw new Error("Unable to read assistant comment context");
  const rows = [...(comments ?? [])].reverse();
  const names = await actorNames(service, actorId, rows);
  const thread = rows.map((row) => ({
    author: names.name(row.author_id as string | null, !!row.via_assistant),
    body: (row.body as string | null) ?? "",
  }));
  const quote = typeof root?.quote === "string" && root.quote.trim()
    ? `\n\nThe thread is anchored to this quote:\n${root.quote}`
    : "";
  await runSharedSurfaceMention({
    ...input,
    surface: "page_comment",
    sourceThreadId: rootId,
    sourceEventId: triggerCommentId,
    actorMetadata: names.users.get(actorId)?.user_metadata,
    projectId: page.project_id as string,
    title: `Page: ${page.title as string}`,
    prompt: sharedSurfacePrompt({
      author: names.name(actorId),
      trigger: input.trigger ?? "mention",
      target: `the page “${page.title as string}”${quote}`,
      body: triggerRow.body as string,
      thread,
    }),
    answer: triggerRow.body as string,
    source: "page",
    context: {
      projectId: page.project_id as string,
      pageId,
      pageTitle: page.title as string,
    },
    destination: {
      kind: "comment",
      table: "page_comments",
      locale: input.locale,
      notification: {
        type: "page_comment",
        candidateUserIds: [root?.author_id, page.created_by],
        pageId,
        blockId: (triggerRow.block_id as string | null) ?? null,
      },
    },
    createResponse: async () => {
      const { data, error } = await commentStore(service, "page_comments", actorId).insert({
        page_id: pageId,
        project_id: page.project_id,
        block_id: (triggerRow.block_id as string | null) ?? null,
        quote: null,
        author_id: actorId,
        parent_id: rootId,
        body: "",
        via_assistant: true,
        assistant_status: "working",
      }).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Unable to create response");
      return {
        id: data.id as string,
        display: commentDisplay(service, data.id as string, "page_comments"),
      };
    },
  });
}

export async function runFeedbackCommentMention(input: {
  supabase: SupabaseClient;
  service: SupabaseClient;
  postId: string;
  actorId: string;
  triggerCommentId: string;
  locale: string;
  trigger?: "mention" | "reply";
}): Promise<void> {
  const { service, actorId, postId, triggerCommentId } = input;
  const { data: post } = await service.from("feedback_posts")
    .select("id, project_id, title").eq("id", postId)
    .is("deleted_at", null).maybeSingle();
  if (
    !post
    || !await getProjectAccess(actorId, post.project_id as string)
    || !await hasUsageBudget(actorId, "assistant", "assistant_model")
  ) return;
  const { data: triggerRow } = await commentStore(service, "comments", actorId)
    .select("id, parent_id, body, author_id").eq("id", triggerCommentId).eq("feedback_post_id", postId).maybeSingle();
  if (!triggerRow) return;
  const rootId = (triggerRow.parent_id as string | null) ?? triggerRow.id as string;

  const [{ data: comments, error: commentsError }, { data: attachments }, { data: root, error: rootError }] = await Promise.all([
    commentStore(service, "comments", actorId).select(
      "id, author_id, body, via_assistant, created_at, visibility, feedback_users!feedback_user_id (name, email, pseudonym)",
    ).eq("feedback_post_id", postId).or(`id.eq.${rootId},parent_id.eq.${rootId}`)
      .order("created_at", { ascending: false }).limit(20),
    service.from("attachments").select(PROMPT_ATTACHMENT_COLUMNS)
      .eq("feedback_post_id", postId).order("created_at", { ascending: true }),
    commentStore(service, "comments", actorId).select("author_id").eq("id", rootId).eq("feedback_post_id", postId).maybeSingle(),
  ]);
  if (commentsError || rootError) throw new Error("Unable to read assistant comment context");
  const rows = [...(comments ?? [])].reverse();
  const names = await actorNames(service, actorId, rows);
  const grouped = groupPromptAttachments(attachments);
  const thread = rows.map((row) => {
    const visitor = row.feedback_users as unknown as {
      name: string | null;
      email: string | null;
      pseudonym: string;
    } | null;
    const author = visitor
      ? visitor.name?.trim() || visitor.email?.trim() || visitor.pseudonym
      : names.name(row.author_id as string | null, !!row.via_assistant);
    return {
      author,
      audience: visitor
        ? "public board visitor"
        : row.visibility === "public" ? "public team reply" : "internal team comment",
      body: (row.body as string | null) ?? "",
      attachments: grouped.get(row.id as string)?.map((attachment) => attachment.file_name),
    };
  });
  await runSharedSurfaceMention({
    ...input,
    surface: "feedback_comment",
    sourceThreadId: rootId,
    sourceEventId: triggerCommentId,
    actorMetadata: names.users.get(actorId)?.user_metadata,
    projectId: post.project_id as string,
    title: `Feedback: ${post.title as string}`,
    prompt: sharedSurfacePrompt({
      author: names.name(actorId),
      trigger: input.trigger ?? "mention",
      target: `the feedback post “${post.title as string}”`,
      body: triggerRow.body as string,
      thread,
    }),
    answer: triggerRow.body as string,
    source: "feedback",
    context: {
      projectId: post.project_id as string,
      feedbackId: postId,
      feedbackTitle: post.title as string,
    },
    attachments: [
      ...(grouped.get(triggerCommentId) ?? []),
      ...(grouped.get(null) ?? []),
    ].slice(0, 5),
    destination: {
      kind: "comment",
      table: "comments",
      locale: input.locale,
      notification: {
        type: "comment",
        candidateUserIds: [root?.author_id],
        feedbackPostId: postId,
      },
    },
    createResponse: async () => {
      const { data, error } = await commentStore(service, "comments", actorId).insert({
        feedback_post_id: postId,
        author_id: actorId,
        parent_id: rootId,
        body: "",
        via_assistant: true,
        assistant_status: "working",
      }).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Unable to create response");
      return { id: data.id as string, display: commentDisplay(service, data.id as string) };
    },
  });
}
