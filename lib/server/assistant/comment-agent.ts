import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantToolCall } from "@/lib/assistant-types";
import { getProjectAccess } from "@/lib/server/project-access";
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
  resolveNumoDefaultStatus,
  type NumoDefaultStatus,
} from "@/lib/numo-default-status";
import { executeTool } from "./execute-tool";
import { ASSISTANT_TOOLS } from "./tools";
import {
  buildCommentSystemPrompt,
  type CommentPromptThreadEntry,
} from "./prompt";
import { gatherProjectPromptContext } from "./prompt-context";
import { serializeToolResult, type ChatMessage } from "./loop";

// ── @Numo in comments (fire and forget, Linear-style) ───────────────────
// A comment mentioning @numo spawns this agent AFTER the HTTP response (via
// next/server's after()). It posts a threaded reply immediately as a live
// placeholder (assistant_status='working'), streams its progress into that
// row (assistant_tool = current step, body = current text — Realtime pushes
// each update to viewers), and finishes with only the final message visible.
// No conversation is stored: the reply comment IS the whole artifact.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_TOOL_ROUNDS = 6;
/** Min interval between live body updates while text streams (Realtime spam guard). */
const BODY_UPDATE_INTERVAL_MS = 900;

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

// Fire-and-forget: no ask_user — the loop can never pause for the user.
const COMMENT_TOOLS = ASSISTANT_TOOLS.filter(
  (t) => t.function.name !== "ask_user"
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
      .eq("id", issueId)
      .maybeSingle();
    if (!issue) return;

    const access = await getProjectAccess(actorId, issue.project_id as string);
    if (!access) return;

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

    // Live display updates (best-effort; each one reaches viewers via Realtime).
    const setDisplay = async (fields: Record<string, unknown>) => {
      await service.from("comments").update(fields).eq("id", replyId);
    };

    // ── Gather prompt context ────────────────────────────────────────────
    const [promptProject, { data: threadRows }] = await Promise.all([
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
        .select("author_id, body, via_assistant, created_at")
        .eq("issue_id", issueId)
        .neq("id", replyId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const recentComments = [...(threadRows ?? [])].reverse();
    const authorIds = recentComments.map((c) => c.author_id as string);
    const users = await fetchAuthUsersById(service, [...authorIds, actorId]);
    const authorName = (id: string | null, viaAssistant?: boolean): string =>
      viaAssistant ? "Numo" : displayName(toNamed(id ? users.get(id) : null), "User");

    const thread: CommentPromptThreadEntry[] = recentComments.map((c) => ({
      author: authorName(c.author_id as string | null, !!c.via_assistant),
      body: (c.body as string) ?? "",
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

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${authorName(actorId)} ${
          trigger === "reply"
            ? "replied to your comment"
            : "mentioned you in a comment"
        } on ${issueIdentifier(
          access.project.key,
          issue.number as number
        )}:\n"""\n${triggerRow.body as string}\n"""`,
      },
    ];

    // ── Agent loop (streamed, in-memory only — nothing persisted per round)
    const finalContent = await runLoop(messages, {
      projectId: issue.project_id as string,
      userId: actorId,
      supabase,
      service,
      locale,
      // Landing status for issues Numo creates here (Account → Preferences).
      numoDefaultStatus: resolveNumoDefaultStatus(
        users.get(actorId)?.user_metadata
      ),
      onTool: (name) => void setDisplay({ assistant_tool: name }),
      onText: (partial) =>
        void setDisplay({ assistant_tool: null, body: partial }),
    });

    // ── Finalize: only the final message remains ─────────────────────────
    await setDisplay({
      body: finalContent || FALLBACK_DONE[locale] || FALLBACK_DONE.en,
      assistant_status: "done",
      assistant_tool: null,
    });

    // Notifications, like a regular comment: issue owner/assignee + thread
    // root author — never the requester themself, members only.
    const valid = await projectMemberIds(service, issue.project_id as string);
    const { data: rootComment } = await service
      .from("comments")
      .select("author_id")
      .eq("id", rootId)
      .maybeSingle();
    const targets = new Set<string>();
    for (const uid of [
      rootComment?.author_id,
      issue.created_by,
      issue.assignee_id,
    ] as (string | null | undefined)[]) {
      if (uid && uid !== actorId && valid.has(uid)) targets.add(uid);
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
    if (replyId) {
      // Empty body + status 'error' → the timeline renders a localized
      // "Numo couldn't complete this" line per viewer.
      await service
        .from("comments")
        .update({ body: "", assistant_status: "error", assistant_tool: null })
        .eq("id", replyId);
    }
  }
}

// ── Streaming loop (adapted from loop.ts, without SSE/persistence) ───────

async function runLoop(
  messages: ChatMessage[],
  ctx: {
    projectId: string;
    userId: string;
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

  const cfg = await getAppConfigValues(["assistant_model", "fallback_model"]);
  const model =
    cfg["assistant_model"]?.trim() ||
    cfg["fallback_model"]?.trim() ||
    "deepseek/deepseek-v4-flash";

  let finalContent = "";
  let continueLoop = true;
  let roundCount = 0;

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
        model,
        messages,
        stream: true,
        max_tokens: 4096,
        ...(lastRound ? {} : { tools: COMMENT_TOOLS }),
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
    let lastTextUpdate = 0;
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
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          fullContent += delta.content;
          // Live "he's writing" display, throttled: each update replaces the
          // previous tool/message shown under the Working state.
          const now = Date.now();
          if (now - lastTextUpdate > BODY_UPDATE_INTERVAL_MS) {
            lastTextUpdate = now;
            ctx.onText(fullContent);
          }
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
          supabase: ctx.supabase,
          service: ctx.service,
          locale: ctx.locale,
          numoDefaultStatus: ctx.numoDefaultStatus,
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

  return finalContent;
}
