import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantToolCall } from "@/lib/assistant-types";
import { getProjectAccess } from "@/lib/server/project-access";
import { hasUsageBudget } from "@/lib/server/usage";
import { isWebSearchEnabled, withoutWebSearch } from "@/lib/server/web-search";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import { issueIdentifier } from "@/lib/issue-constants";
import {
  insertNotifications,
  projectMemberIds,
  type NotificationRow,
} from "@/lib/server/notifications";
import { getAppConfigValues } from "@/lib/server/app-config";
import {
  modelConfigKeys,
  resolveCascadeFromValues,
} from "@/lib/server/model-config";
import {
  resolveNumoDefaultStatus,
  type NumoDefaultStatus,
} from "@/lib/numo-default-status";
import { executeTool } from "./execute-tool";
import { ASSISTANT_TOOLS } from "./tools";
import {
  buildCommentSystemPrompt,
  buildObjectiveCommentSystemPrompt,
  buildFeedbackCommentSystemPrompt,
  type CommentPromptThreadEntry,
} from "./prompt";
import { commentDisplay, type CommentDisplay } from "./comment-live";
import { gatherProjectPromptContext } from "./prompt-context";
import { buildAttachmentParts, type PromptAttachment } from "./attachment-parts";
import { recordAiUsage, newRunId, type AiUsageInput } from "@/lib/server/ai-usage";
import {
  getModelInputModalities,
  serializeToolResult,
  type ChatContentPart,
  type ChatMessage,
} from "./loop";

// ── @Numo in comments (fire and forget, Linear-style) ───────────────────
// A comment mentioning @numo spawns this agent AFTER the HTTP response (via
// next/server's after()). It posts a threaded reply immediately as a live
// placeholder (assistant_status='working'), then streams: the text goes out on
// the reply's own Realtime topic (lib/server/assistant/comment-live.ts —
// ephemeral, nothing written), while the row keeps only the state that has to
// survive a missed message (current tool, then the final body). It finishes with
// only the final message visible. No conversation is stored: the reply comment
// IS the whole artifact.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_TOOL_ROUNDS = 6;

/** Detects an @numo / @Numo mention in a comment body (word-boundary, not mid-email). */
export function mentionsNumo(body: string): boolean {
  return /(^|[\s(>])@numo\b/i.test(body);
}

/**
 * Linear-style continuation: a reply posted right under a Numo comment
 * re-triggers Numo without needing a new @numo mention. Threads are flat
 * (depth ≤ 1), so "replying to Numo" = the thread's LAST comment before this
 * reply is a Numo one. A still-'working' Numo comment doesn't count — that
 * run is live and a concurrent second run on the same thread would race it.
 */
export async function replyTargetsNumo(
  service: SupabaseClient,
  comment: { id: string; issue_id: string; parent_id: string | null }
): Promise<boolean> {
  if (!comment.parent_id) return false;
  const { data: last } = await service
    .from("comments")
    .select("via_assistant, assistant_status")
    .eq("issue_id", comment.issue_id)
    .or(`id.eq.${comment.parent_id},parent_id.eq.${comment.parent_id}`)
    .neq("id", comment.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return !!last?.via_assistant && last.assistant_status !== "working";
}

/** Objective twin of replyTargetsNumo — the thread is scoped by objective_id. */
export async function replyTargetsNumoObjective(
  service: SupabaseClient,
  comment: { id: string; objective_id: string; parent_id: string | null }
): Promise<boolean> {
  if (!comment.parent_id) return false;
  const { data: last } = await service
    .from("comments")
    .select("via_assistant, assistant_status")
    .eq("objective_id", comment.objective_id)
    .or(`id.eq.${comment.parent_id},parent_id.eq.${comment.parent_id}`)
    .neq("id", comment.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return !!last?.via_assistant && last.assistant_status !== "working";
}

/** Feedback twin of replyTargetsNumo — the thread is scoped by feedback_post_id. */
export async function replyTargetsNumoFeedback(
  service: SupabaseClient,
  comment: { id: string; feedback_post_id: string; parent_id: string | null }
): Promise<boolean> {
  if (!comment.parent_id) return false;
  const { data: last } = await service
    .from("comments")
    .select("via_assistant, assistant_status")
    .eq("feedback_post_id", comment.feedback_post_id)
    .or(`id.eq.${comment.parent_id},parent_id.eq.${comment.parent_id}`)
    .neq("id", comment.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return !!last?.via_assistant && last.assistant_status !== "working";
}

// Fire-and-forget: no ask_user — the loop can never pause for the user. Same
// for propose_backlog (MIN-173) : sa proposition s'ouvre dans le panneau de
// Numo, qu'un commentaire de ticket n'a pas sous la main.
const COMMENT_TOOLS = ASSISTANT_TOOLS.filter(
  (t) => !["ask_user", "propose_backlog"].includes(t.function.name)
);

// Stored comment content is written once in the requester's locale (unlike UI
// chrome, which localizes per viewer).
const FALLBACK_DONE: Record<string, string> = {
  fr: "C'est fait.",
  en: "Done.",
};

export async function runCommentMention({
  supabase,
  service,
  issueId,
  actorId,
  triggerCommentId,
  locale,
  trigger = "mention",
}: {
  /** The mentioning user's RLS client (still valid inside after()). */
  supabase: SupabaseClient;
  service: SupabaseClient;
  issueId: string;
  actorId: string;
  triggerCommentId: string;
  locale: string;
  /** How Numo got pulled in: an explicit @numo, or a reply under its comment. */
  trigger?: "mention" | "reply";
}): Promise<void> {
  let replyId: string | null = null;
  // Hissé hors du try : le catch écrit l'échec par le MÊME afficheur, donc dans
  // la même file d'écritures — sa mise à jour passe forcément après celles qui
  // seraient encore en vol.
  let display: CommentDisplay | null = null;
  try {
    // ── Resolve the trigger comment, its thread root, and the issue ─────
    const { data: triggerRow } = await service
      .from("comments")
      .select("id, parent_id, body, author_id")
      .eq("id", triggerCommentId)
      .maybeSingle();
    if (!triggerRow) return;
    const rootId =
      (triggerRow.parent_id as string | null) ?? (triggerRow.id as string);

    const { data: issue } = await service
      .from("issues")
      .select("*, issue_categories(category_id)")
      .is("deleted_at", null)
      .eq("id", issueId)
      .maybeSingle();
    if (!issue) return;

    const access = await getProjectAccess(actorId, issue.project_id as string);
    if (!access) return;

    // Budget du plan (MIN-72) — fire-and-forget : à sec, skip silencieux.
    if (!(await hasUsageBudget(actorId))) return;

    // ── Post the live placeholder reply right away ───────────────────────
    const { data: reply, error: replyError } = await service
      .from("comments")
      .insert({
        issue_id: issueId,
        author_id: actorId,
        parent_id: rootId,
        body: "",
        via_assistant: true,
        assistant_status: "working",
      })
      .select("id")
      .single();
    if (replyError || !reply) {
      console.error("[numo-comment] placeholder failed:", replyError?.message);
      return;
    }
    replyId = reply.id as string;

    // Live display: text on the reply's Realtime topic, state in the row.
    display = commentDisplay(service, replyId);

    // ── Gather prompt context ────────────────────────────────────────────
    const [promptProject, { data: threadRows }, { data: attachmentRows }] =
      await Promise.all([
        gatherProjectPromptContext({
          supabase,
          service,
          project: access.project as unknown as {
            id: string;
            name: string;
            key: string;
            owner_id: string;
          },
        }),
        // The LAST 20 comments (that's where the live discussion is), re-sorted
        // chronologically below for the prompt.
        service
          .from("comments")
          .select("id, author_id, body, via_assistant, created_at")
          .eq("issue_id", issueId)
          .neq("id", replyId)
          .order("created_at", { ascending: false })
          .limit(20),
        // Every attachment of the issue in one query — thread lines name them,
        // the trigger comment's (+ issue-level ones) feed the model directly.
        service
          .from("attachments")
          .select("comment_id, storage_path, file_name, mime_type, size_bytes")
          .eq("issue_id", issueId)
          .order("created_at", { ascending: true }),
      ]);

    const attachmentsByComment = new Map<string | null, PromptAttachment[]>();
    for (const row of attachmentRows ?? []) {
      const key = (row.comment_id as string | null) ?? null;
      const list = attachmentsByComment.get(key) ?? [];
      list.push({
        storage_path: row.storage_path as string,
        file_name: row.file_name as string,
        mime_type: row.mime_type as string,
        size_bytes: row.size_bytes as number,
      });
      attachmentsByComment.set(key, list);
    }

    const recentComments = [...(threadRows ?? [])].reverse();
    const authorIds = recentComments.map((c) => c.author_id as string);
    const users = await fetchAuthUsersById(service, [...authorIds, actorId]);
    const authorName = (id: string | null, viaAssistant?: boolean): string =>
      viaAssistant ? "Numo" : displayName(toNamed(id ? users.get(id) : null), "User");

    const thread: CommentPromptThreadEntry[] = recentComments.map((c) => ({
      author: authorName(c.author_id as string | null, !!c.via_assistant),
      body: (c.body as string) ?? "",
      attachments: attachmentsByComment
        .get(c.id as string)
        ?.map((a) => a.file_name),
    }));

    const categories = (issue.issue_categories ?? []) as Array<{
      category_id: string;
    }>;
    const systemPrompt = buildCommentSystemPrompt({
      project: promptProject,
      issue: {
        id: issue.id as string,
        identifier: issueIdentifier(access.project.key, issue.number as number),
        title: issue.title as string,
        description: (issue.description as string | null) ?? null,
        status: issue.status as string,
        priority: issue.priority as string,
        effort: (issue.effort as string | null) ?? null,
        assignee_id: (issue.assignee_id as string | null) ?? null,
        objective_id: (issue.objective_id as string | null) ?? null,
        due_date: (issue.due_date as string | null) ?? null,
        category_ids: categories.map((c) => c.category_id),
      },
      thread,
      locale,
    });

    // Model resolved here (not in runLoop) so its input modalities can gate
    // the attachment parts below.
    const cfg = await getAppConfigValues([
      ...modelConfigKeys("assistant_model"),
      ...modelConfigKeys("fallback_model"),
    ]);
    const { model } = resolveCascadeFromValues(["assistant_model", "fallback_model"], cfg);

    const triggerText = `${authorName(actorId)} ${
      trigger === "reply"
        ? "replied to your comment"
        : "mentioned you in a comment"
    } on ${issueIdentifier(
      access.project.key,
      issue.number as number
    )}:\n"""\n${triggerRow.body as string}\n"""`;

    // Files the model gets to actually look at: the trigger comment's, then
    // the issue-level ones — capped to keep the request bounded.
    const directAttachments = [
      ...(attachmentsByComment.get(triggerCommentId) ?? []),
      ...(attachmentsByComment.get(null) ?? []),
    ].slice(0, 5);

    let triggerContent: string | ChatContentPart[] = triggerText;
    if (directAttachments.length > 0) {
      const apiKey = process.env.OPENROUTER_API_KEY ?? "";
      const modalities = await getModelInputModalities(model, apiKey);
      triggerContent = [
        { type: "text", text: triggerText },
        ...(await buildAttachmentParts(service, directAttachments, {
          modalities,
          includeHeavy: true,
        })),
      ];
    }

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: triggerContent },
    ];

    // ── Agent loop (streamed, in-memory only — nothing persisted per round)
    const finalContent = await runLoop(messages, {
      model,
      projectId: issue.project_id as string,
      userId: actorId,
      supabase,
      service,
      locale,
      // Landing status for issues Numo creates here (Account → Preferences).
      numoDefaultStatus: resolveNumoDefaultStatus(
        users.get(actorId)?.user_metadata
      ),
      onTool: (name) => display?.tool(name),
      onText: (partial) => display?.stream(partial),
    });

    // ── Finalize: only the final message remains ─────────────────────────
    await display.finish(
      finalContent || FALLBACK_DONE[locale] || FALLBACK_DONE.en
    );

    // Notifications, like a regular comment: issue owner/assignee + thread
    // root author, members only — PLUS the requester. A human comment never
    // notifies its own author, but this one is Numo's: the person it just
    // answered is precisely who has something new to read. The 'comment'
    // category of the account settings gates the whole thing, as usual.
    const valid = await projectMemberIds(service, issue.project_id as string);
    const { data: rootComment } = await service
      .from("comments")
      .select("author_id")
      .eq("id", rootId)
      .maybeSingle();
    const targets = new Set<string>();
    for (const uid of [
      actorId,
      rootComment?.author_id,
      issue.created_by,
      issue.assignee_id,
    ] as (string | null | undefined)[]) {
      if (uid && valid.has(uid)) targets.add(uid);
    }
    const rows: NotificationRow[] = [...targets].map((uid) => ({
      user_id: uid,
      project_id: issue.project_id as string,
      type: "comment" as const,
      issue_id: issueId,
      comment_id: replyId as string,
      actor_id: actorId,
    }));
    await insertNotifications(service, rows);
  } catch (err) {
    console.error("[numo-comment] failed:", err);
    // Empty body + status 'error' → the timeline renders a localized
    // "Numo couldn't complete this" line per viewer.
    await display?.fail();
  }
}

export async function runObjectiveCommentMention({
  supabase,
  service,
  objectiveId,
  actorId,
  triggerCommentId,
  locale,
  trigger = "mention",
}: {
  supabase: SupabaseClient;
  service: SupabaseClient;
  objectiveId: string;
  actorId: string;
  triggerCommentId: string;
  locale: string;
  trigger?: "mention" | "reply";
}): Promise<void> {
  let replyId: string | null = null;
  // Hissé hors du try : le catch écrit l'échec par le MÊME afficheur, donc dans
  // la même file d'écritures — sa mise à jour passe forcément après celles qui
  // seraient encore en vol.
  let display: CommentDisplay | null = null;
  try {
    // ── Resolve the trigger comment, its thread root, and the objective ──
    const { data: triggerRow } = await service
      .from("comments")
      .select("id, parent_id, body, author_id")
      .eq("id", triggerCommentId)
      .maybeSingle();
    if (!triggerRow) return;
    const rootId =
      (triggerRow.parent_id as string | null) ?? (triggerRow.id as string);

    const { data: objective } = await service
      .from("objectives")
      .select("*")
      .is("deleted_at", null)
      .eq("id", objectiveId)
      .maybeSingle();
    if (!objective) return;

    const access = await getProjectAccess(actorId, objective.project_id as string);
    if (!access) return;

    // Budget du plan (MIN-72) — fire-and-forget : à sec, skip silencieux.
    if (!(await hasUsageBudget(actorId))) return;

    // ── Post the live placeholder reply right away ───────────────────────
    const { data: reply, error: replyError } = await service
      .from("comments")
      .insert({
        objective_id: objectiveId,
        author_id: actorId,
        parent_id: rootId,
        body: "",
        via_assistant: true,
        assistant_status: "working",
      })
      .select("id")
      .single();
    if (replyError || !reply) {
      console.error("[numo-comment] objective placeholder failed:", replyError?.message);
      return;
    }
    replyId = reply.id as string;

    display = commentDisplay(service, replyId);

    // ── Gather prompt context (project, thread, attachments, linked issues) ─
    const [promptProject, { data: threadRows }, { data: attachmentRows }, { data: linkedIssues }] =
      await Promise.all([
        gatherProjectPromptContext({
          supabase,
          service,
          project: access.project as unknown as {
            id: string;
            name: string;
            key: string;
            owner_id: string;
          },
        }),
        service
          .from("comments")
          .select("id, author_id, body, via_assistant, created_at")
          .eq("objective_id", objectiveId)
          .neq("id", replyId)
          .order("created_at", { ascending: false })
          .limit(20),
        service
          .from("attachments")
          .select("comment_id, storage_path, file_name, mime_type, size_bytes")
          .eq("objective_id", objectiveId)
          .order("created_at", { ascending: true }),
        service
          .from("issues")
          .select("number, title, status")
          .is("deleted_at", null)
          .eq("objective_id", objectiveId)
          .order("number", { ascending: true }),
      ]);

    const attachmentsByComment = new Map<string | null, PromptAttachment[]>();
    for (const row of attachmentRows ?? []) {
      const key = (row.comment_id as string | null) ?? null;
      const list = attachmentsByComment.get(key) ?? [];
      list.push({
        storage_path: row.storage_path as string,
        file_name: row.file_name as string,
        mime_type: row.mime_type as string,
        size_bytes: row.size_bytes as number,
      });
      attachmentsByComment.set(key, list);
    }

    const recentComments = [...(threadRows ?? [])].reverse();
    const authorIds = recentComments.map((c) => c.author_id as string);
    const users = await fetchAuthUsersById(service, [...authorIds, actorId]);
    const authorName = (id: string | null, viaAssistant?: boolean): string =>
      viaAssistant ? "Numo" : displayName(toNamed(id ? users.get(id) : null), "User");

    const thread: CommentPromptThreadEntry[] = recentComments.map((c) => ({
      author: authorName(c.author_id as string | null, !!c.via_assistant),
      body: (c.body as string) ?? "",
      attachments: attachmentsByComment
        .get(c.id as string)
        ?.map((a) => a.file_name),
    }));

    const systemPrompt = buildObjectiveCommentSystemPrompt({
      project: promptProject,
      objective: {
        id: objective.id as string,
        name: objective.name as string,
        description: (objective.description as string | null) ?? null,
        status: objective.status as string,
        lead_user_id: (objective.lead_user_id as string | null) ?? null,
        target_date: (objective.target_date as string | null) ?? null,
        issues: (linkedIssues ?? []).map((i) => ({
          identifier: issueIdentifier(access.project.key, i.number as number),
          title: i.title as string,
          status: i.status as string,
        })),
      },
      thread,
      locale,
    });

    const cfg = await getAppConfigValues([
      ...modelConfigKeys("assistant_model"),
      ...modelConfigKeys("fallback_model"),
    ]);
    const { model } = resolveCascadeFromValues(["assistant_model", "fallback_model"], cfg);

    const triggerText = `${authorName(actorId)} ${
      trigger === "reply"
        ? "replied to your comment"
        : "mentioned you in a comment"
    } on the objective "${objective.name as string}":\n"""\n${triggerRow.body as string}\n"""`;

    const directAttachments = [
      ...(attachmentsByComment.get(triggerCommentId) ?? []),
      ...(attachmentsByComment.get(null) ?? []),
    ].slice(0, 5);

    let triggerContent: string | ChatContentPart[] = triggerText;
    if (directAttachments.length > 0) {
      const apiKey = process.env.OPENROUTER_API_KEY ?? "";
      const modalities = await getModelInputModalities(model, apiKey);
      triggerContent = [
        { type: "text", text: triggerText },
        ...(await buildAttachmentParts(service, directAttachments, {
          modalities,
          includeHeavy: true,
        })),
      ];
    }

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: triggerContent },
    ];

    const finalContent = await runLoop(messages, {
      model,
      projectId: objective.project_id as string,
      userId: actorId,
      supabase,
      service,
      locale,
      numoDefaultStatus: resolveNumoDefaultStatus(
        users.get(actorId)?.user_metadata
      ),
      onTool: (name) => display?.tool(name),
      onText: (partial) => display?.stream(partial),
    });

    await display.finish(
      finalContent || FALLBACK_DONE[locale] || FALLBACK_DONE.en
    );

    // Notifications: the objective's lead + the thread root author, members
    // only — plus the requester, whom Numo just answered (see the issue twin).
    const valid = await projectMemberIds(service, objective.project_id as string);
    const { data: rootComment } = await service
      .from("comments")
      .select("author_id")
      .eq("id", rootId)
      .maybeSingle();
    const targets = new Set<string>();
    for (const uid of [
      actorId,
      rootComment?.author_id,
      objective.lead_user_id,
    ] as (string | null | undefined)[]) {
      if (uid && valid.has(uid)) targets.add(uid);
    }
    const rows: NotificationRow[] = [...targets].map((uid) => ({
      user_id: uid,
      project_id: objective.project_id as string,
      type: "comment" as const,
      issue_id: null,
      objective_id: objectiveId,
      comment_id: replyId as string,
      actor_id: actorId,
    }));
    await insertNotifications(service, rows);
  } catch (err) {
    console.error("[numo-comment] objective failed:", err);
    await display?.fail();
  }
}

export async function runFeedbackCommentMention({
  supabase,
  service,
  postId,
  actorId,
  triggerCommentId,
  locale,
  trigger = "mention",
}: {
  supabase: SupabaseClient;
  service: SupabaseClient;
  postId: string;
  actorId: string;
  triggerCommentId: string;
  locale: string;
  trigger?: "mention" | "reply";
}): Promise<void> {
  let replyId: string | null = null;
  // Hissé hors du try : le catch écrit l'échec par le MÊME afficheur, donc dans
  // la même file d'écritures — sa mise à jour passe forcément après celles qui
  // seraient encore en vol.
  let display: CommentDisplay | null = null;
  try {
    // ── Resolve the trigger comment, its thread root, and the post ───────
    const { data: triggerRow } = await service
      .from("comments")
      .select("id, parent_id, body, author_id")
      .eq("id", triggerCommentId)
      .maybeSingle();
    if (!triggerRow) return;
    const rootId =
      (triggerRow.parent_id as string | null) ?? (triggerRow.id as string);

    const { data: post } = await service
      .from("feedback_posts")
      .select("id, project_id, title, body, status, vote_count, is_public, issue_id")
      .is("deleted_at", null)
      .eq("id", postId)
      .maybeSingle();
    if (!post) return;

    const access = await getProjectAccess(actorId, post.project_id as string);
    if (!access) return;

    // Budget du plan (MIN-72) — fire-and-forget : à sec, skip silencieux.
    if (!(await hasUsageBudget(actorId))) return;

    // ── Post the live placeholder reply right away ───────────────────────
    const { data: reply, error: replyError } = await service
      .from("comments")
      .insert({
        feedback_post_id: postId,
        author_id: actorId,
        parent_id: rootId,
        body: "",
        via_assistant: true,
        assistant_status: "working",
      })
      .select("id")
      .single();
    if (replyError || !reply) {
      console.error("[numo-comment] feedback placeholder failed:", replyError?.message);
      return;
    }
    replyId = reply.id as string;

    display = commentDisplay(service, replyId);

    // ── Gather prompt context (project, thread, attachments, linked issue) ─
    const [promptProject, { data: threadRows }, { data: attachmentRows }, { data: linkedIssue }] =
      await Promise.all([
        gatherProjectPromptContext({
          supabase,
          service,
          project: access.project as unknown as {
            id: string;
            name: string;
            key: string;
            owner_id: string;
          },
        }),
        service
          .from("comments")
          .select(
            "id, author_id, body, via_assistant, created_at, visibility, feedback_users!feedback_user_id (name, email, pseudonym)"
          )
          .eq("feedback_post_id", postId)
          .neq("id", replyId)
          .order("created_at", { ascending: false })
          .limit(20),
        service
          .from("attachments")
          .select("comment_id, storage_path, file_name, mime_type, size_bytes")
          .eq("feedback_post_id", postId)
          .order("created_at", { ascending: true }),
        post.issue_id
          ? service
              .from("issues")
              .select("number, title, status")
              .is("deleted_at", null)
              .eq("id", post.issue_id as string)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

    const attachmentsByComment = new Map<string | null, PromptAttachment[]>();
    for (const row of attachmentRows ?? []) {
      const key = (row.comment_id as string | null) ?? null;
      const list = attachmentsByComment.get(key) ?? [];
      list.push({
        storage_path: row.storage_path as string,
        file_name: row.file_name as string,
        mime_type: row.mime_type as string,
        size_bytes: row.size_bytes as number,
      });
      attachmentsByComment.set(key, list);
    }

    const recentComments = [...(threadRows ?? [])].reverse();
    const authorIds = recentComments.map((c) => c.author_id as string);
    const users = await fetchAuthUsersById(service, [...authorIds, actorId]);
    const authorName = (id: string | null, viaAssistant?: boolean): string =>
      viaAssistant ? "Numo" : displayName(toNamed(id ? users.get(id) : null), "User");

    // Le fil d'un retour mele DEUX conversations (MIN-196) : les notes d'equipe
    // et ce qui s'ecrit sur le board public. Les servir a plat, avec un visiteur
    // rendu en « User » comme n'importe quel coequipier, c'est demander au
    // modele de raisonner sur des propos dont il ignore et l'origine et la
    // portee — et de repondre « comme l'a dit X plus haut » a propos d'un
    // inconnu qui a ecrit sur une page publique.
    //
    // Chaque entree porte donc d'ou elle vient. Numo ne repond QUE dans les fils
    // internes (le declencheur se coupe sur le public, voir la route des
    // commentaires) : le public est ici de la LECTURE.
    const thread: CommentPromptThreadEntry[] = recentComments.map((c) => {
      const visitor = c.feedback_users as unknown as {
        name: string | null;
        email: string | null;
        pseudonym: string;
      } | null;
      const who = visitor
        ? visitor.name?.trim() || visitor.email?.trim() || visitor.pseudonym
        : authorName(c.author_id as string | null, !!c.via_assistant);
      return {
        author: visitor
          ? `${who} (board visitor — PUBLIC comment)`
          : c.visibility === "public"
            ? `${who} (team — PUBLIC reply, read on the board)`
            : who,
        body: (c.body as string) ?? "",
        attachments: attachmentsByComment
          .get(c.id as string)
          ?.map((a) => a.file_name),
      };
    });

    const linked = linkedIssue
      ? {
          identifier: issueIdentifier(
            access.project.key,
            (linkedIssue as { number: number }).number
          ),
          title: (linkedIssue as { title: string }).title,
          status: (linkedIssue as { status: string }).status,
        }
      : null;

    const systemPrompt = buildFeedbackCommentSystemPrompt({
      project: promptProject,
      feedback: {
        id: post.id as string,
        title: post.title as string,
        body: (post.body as string | null) ?? null,
        status: post.status as string,
        vote_count: (post.vote_count as number) ?? 0,
        is_public: !!post.is_public,
        linked_issue: linked,
      },
      thread,
      locale,
    });

    const cfg = await getAppConfigValues([
      ...modelConfigKeys("assistant_model"),
      ...modelConfigKeys("fallback_model"),
    ]);
    const { model } = resolveCascadeFromValues(["assistant_model", "fallback_model"], cfg);

    const triggerText = `${authorName(actorId)} ${
      trigger === "reply"
        ? "replied to your comment"
        : "mentioned you in a comment"
    } on the feedback post "${post.title as string}":\n"""\n${triggerRow.body as string}\n"""`;

    const directAttachments = [
      ...(attachmentsByComment.get(triggerCommentId) ?? []),
      ...(attachmentsByComment.get(null) ?? []),
    ].slice(0, 5);

    let triggerContent: string | ChatContentPart[] = triggerText;
    if (directAttachments.length > 0) {
      const apiKey = process.env.OPENROUTER_API_KEY ?? "";
      const modalities = await getModelInputModalities(model, apiKey);
      triggerContent = [
        { type: "text", text: triggerText },
        ...(await buildAttachmentParts(service, directAttachments, {
          modalities,
          includeHeavy: true,
        })),
      ];
    }

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: triggerContent },
    ];

    const finalContent = await runLoop(messages, {
      model,
      projectId: post.project_id as string,
      userId: actorId,
      // The current post — feedback tools default to it when the model omits
      // feedback_post_id ("promote this feedback", "link it to MIN-12").
      feedbackPostId: postId,
      supabase,
      service,
      locale,
      numoDefaultStatus: resolveNumoDefaultStatus(
        users.get(actorId)?.user_metadata
      ),
      onTool: (name) => display?.tool(name),
      onText: (partial) => display?.stream(partial),
    });

    await display.finish(
      finalContent || FALLBACK_DONE[locale] || FALLBACK_DONE.en
    );

    // Notifications: the thread root author, members only — plus the
    // requester, whom Numo just answered (see the issue twin). (A feedback
    // post has no owner/assignee/lead.)
    const valid = await projectMemberIds(service, post.project_id as string);
    const { data: rootComment } = await service
      .from("comments")
      .select("author_id")
      .eq("id", rootId)
      .maybeSingle();
    const targets = new Set<string>();
    for (const uid of [actorId, rootComment?.author_id] as (
      | string
      | null
      | undefined
    )[]) {
      if (uid && valid.has(uid)) targets.add(uid);
    }
    const rows: NotificationRow[] = [...targets].map((uid) => ({
      user_id: uid,
      project_id: post.project_id as string,
      type: "comment" as const,
      issue_id: null,
      feedback_post_id: postId,
      comment_id: replyId as string,
      actor_id: actorId,
    }));
    await insertNotifications(service, rows);
  } catch (err) {
    console.error("[numo-comment] feedback failed:", err);
    await display?.fail();
  }
}

// ── Streaming loop (adapted from loop.ts, without SSE/persistence) ───────

async function runLoop(
  messages: ChatMessage[],
  ctx: {
    model: string;
    projectId: string;
    userId: string;
    /** Set only in feedback comment mode — the post the feedback tools default
        to when the model omits feedback_post_id. */
    feedbackPostId?: string | null;
    supabase: SupabaseClient;
    service: SupabaseClient;
    locale: string;
    numoDefaultStatus: NumoDefaultStatus;
    onTool: (name: string) => void;
    onText: (partial: string) => void;
  }
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  let finalContent = "";
  let continueLoop = true;
  let roundCount = 0;
  // Suivi des coûts : un run = ce @numo ; chaque round est un appel.
  const runId = newRunId();
  const usageRows: AiUsageInput[] = [];
  // Recherche web du tour : même run que les appels ci-dessus, plafonnée sur la
  // durée du @numo (ses lignes de ledger, elles, sont écrites au fil de l'eau).
  // Coupée côté admin, le tool n'est pas proposé du tout.
  const webSearchEnabled = await isWebSearchEnabled();
  const webSearch = webSearchEnabled ? { runId, used: 0 } : undefined;
  const tools = webSearchEnabled ? COMMENT_TOOLS : withoutWebSearch(COMMENT_TOOLS);

  while (continueLoop) {
    continueLoop = false;
    roundCount++;
    // Past the round cap, force a text-only conclusion (no tools offered).
    const lastRound = roundCount >= MAX_TOOL_ROUNDS;

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://minddy.app",
        "X-Title": "Numo (minddy)",
      },
      body: JSON.stringify({
        model: ctx.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        usage: { include: true },
        max_tokens: 4096,
        ...(lastRound ? {} : { tools }),
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM error (${response.status}): ${errorText.slice(0, 200)}`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body from LLM");

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let generationId: string | null = null;
    let modelUsed: string | null = null;
    let usageInfo:
      | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number }
      | null = null;
    const toolCallAccumulators: Map<
      number,
      { id: string; name: string; arguments: string }
    > = new Map();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        if (parsed.id && !generationId) generationId = parsed.id;
        if (parsed.model) modelUsed = parsed.model;
        if (parsed.usage) usageInfo = parsed.usage;

        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          fullContent += delta.content;
          // Live "he's writing" display: the round's text as written so far,
          // never a delta. The cadence is the transport's business (see
          // comment-live.ts) — the loop just says what it has.
          ctx.onText(fullContent);
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallAccumulators.has(idx)) {
              toolCallAccumulators.set(idx, {
                id: tc.id || "",
                name: tc.function?.name || "",
                arguments: "",
              });
            }
            const acc = toolCallAccumulators.get(idx)!;
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name = tc.function.name;
            if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          }
        }
      }
    }

    usageRows.push({
      runId,
      seq: roundCount - 1,
      feature: "numo_comment",
      model: modelUsed,
      generationId,
      promptTokens: usageInfo?.prompt_tokens ?? null,
      completionTokens: usageInfo?.completion_tokens ?? null,
      totalTokens: usageInfo?.total_tokens ?? null,
      cost: usageInfo?.cost ?? null,
      // L'auteur de la mention paye — c'est son budget qui a ouvert le tour
      // (`hasUsageBudget(actorId)`), même sur le projet d'un autre.
      billTo: { userId: ctx.userId },
      projectId: ctx.projectId,
    });

    if (toolCallAccumulators.size > 0) {
      const assistantToolCalls: AssistantToolCall[] = [...toolCallAccumulators.values()].map(
        (acc) => ({
          id: acc.id,
          type: "function",
          function: { name: acc.name, arguments: acc.arguments },
        })
      );
      messages.push({
        role: "assistant",
        content: fullContent || null,
        tool_calls: assistantToolCalls,
      });

      for (const [, acc] of toolCallAccumulators) {
        ctx.onTool(acc.name);
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(acc.arguments);
        } catch {
          // Invalid JSON from LLM
        }
        const { result } = await executeTool(acc.name, args, {
          projectId: ctx.projectId,
          userId: ctx.userId,
          feedbackPostId: ctx.feedbackPostId ?? null,
          supabase: ctx.supabase,
          service: ctx.service,
          locale: ctx.locale,
          numoDefaultStatus: ctx.numoDefaultStatus,
          triggerSource: "mention",
          webSearch,
        });
        messages.push({
          role: "tool",
          tool_call_id: acc.id,
          content: serializeToolResult(result, 12000),
        });
      }
      continueLoop = true;
    } else {
      finalContent = fullContent;
    }
  }

  await recordAiUsage(usageRows);

  return finalContent;
}
