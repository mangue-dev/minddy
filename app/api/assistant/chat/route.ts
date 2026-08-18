import { NextRequest } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { ensureUsageBudget } from "@/lib/server/usage";
import {
  isPlanLimitError,
  planLimitResponse,
} from "@/lib/server/plan-limit-error";
import type {
  AssistantChatRequest,
  AssistantMention,
  AssistantPageContext,
  AssistantPinnedContext,
} from "@/lib/assistant-types";
import { createSafeEmitter } from "@/lib/server/assistant/sse";
import { commandNote, parseCommand } from "@/lib/server/assistant/commands";
import { sanitizeAssistantMessageContent } from "@/lib/server/assistant/sanitize";
import {
  ASSISTANT_TOOLS,
  GLOBAL_ASSISTANT_TOOLS,
  type AssistantToolDef,
} from "@/lib/server/assistant/tools";
import {
  buildClockBlock,
  buildGlobalSystemPrompt,
  buildPageContextBlock,
  buildSystemPrompt,
} from "@/lib/server/assistant/prompt";
import { gatherProjectPromptContext } from "@/lib/server/assistant/prompt-context";
import { fallbackShortTitle, generateShortTitle } from "@/lib/server/short-title";
import { recordAiUsage, newRunId } from "@/lib/server/ai-usage";
import { isWebSearchEnabled, withoutWebSearch } from "@/lib/server/web-search";
import {
  getModelInputModalities,
  modelSupportsCaching,
  processChat,
  type ChatContentPart,
  type ChatMessage,
} from "@/lib/server/assistant/loop";
import { buildAttachmentParts } from "@/lib/server/assistant/attachment-parts";
import { parseResourcesInput } from "@/lib/server/attachments";
import { resolveNumoDefaultStatus } from "@/lib/numo-default-status";
import { resolveAiRuntime } from "@/lib/server/ai-runtime";
import type { AttachmentInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const ASSISTANT_CHAT_RATE_LIMIT = { limit: 20 };

/** What a pinned pill can refer to, and what an “@” can quote. THE
 * two tables are side by side because they follow each other: what is pinned to the
 * @ button is also quoted in the text. */
const PINNED_KINDS: ReadonlySet<string> = new Set([
  "issue",
  "project",
  "member",
  "objective",
  "page",
]);
const MENTION_TYPES: ReadonlySet<string> = new Set([
  "member",
  "project",
  "issue",
  "objective",
  "page",
]);

/** Validate the untrusted client-sent page context (prompt-only trust: every
 *  write it could lead to is access-gated in executeTool / lib/server). */
function parsePageContext(raw: unknown): AssistantPageContext | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const pick = (key: string): string | undefined =>
    typeof obj[key] === "string" && (obj[key] as string).length <= 500
      ? (obj[key] as string)
      : undefined;
  // Bulk selection: a board hands over up to a few dozen tickets. Same string
  // budget per entry, and a hard cap so a forged payload can't bloat the prompt.
  const pickList = (key: string): string[] | undefined => {
    const raw = obj[key];
    if (!Array.isArray(raw)) return undefined;
    const list = raw
      .filter((v): v is string => typeof v === "string" && v.length <= 500)
      .slice(0, 50);
    return list.length > 0 ? list : undefined;
  };
  // Context pinned by hand (@ button of the composer): some entries,
  // short wording. The ids are only quoted in the prompt — each tool
  // goes back through the user's RLS, so nothing opens here.
  const pinned = ((): AssistantPinnedContext[] | undefined => {
    if (!Array.isArray(obj.pinned)) return undefined;
    const list = obj.pinned
      .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
      .filter(
        (v) =>
          PINNED_KINDS.has(v.kind as string) &&
          typeof v.id === "string" &&
          v.id.length <= 100 &&
          typeof v.label === "string" &&
          v.label.length <= 200,
      )
      .slice(0, 20)
      .map((v) => ({
        kind: v.kind as AssistantPinnedContext["kind"],
        id: v.id as string,
        label: v.label as string,
        ...(typeof v.detail === "string" && v.detail.length <= 500
          ? { detail: v.detail }
          : {}),
        ...(typeof v.avatarSeed === "string" && v.avatarSeed.length <= 100
          ? { avatarSeed: v.avatarSeed }
          : {}),
        ...(typeof v.color === "string" && v.color.length <= 32
          ? { color: v.color }
          : {}),
      }));
    return list.length > 0 ? list : undefined;
  })();

  const ctx: AssistantPageContext = {
    projectId: pick("projectId"),
    pinned,
    onglet: obj.onglet === "my" || obj.onglet === "all" ? obj.onglet : undefined,
    issueId: pick("issueId"),
    issueIds: pickList("issueIds"),
    issueIdentifiers: pickList("issueIdentifiers"),
    issueTitles: pickList("issueTitles"),
    issueIdentifier: pick("issueIdentifier"),
    issueTitle: pick("issueTitle"),
    objectiveId: pick("objectiveId"),
    objectiveName: pick("objectiveName"),
    objectiveColor: pick("objectiveColor"),
    feedbackId: pick("feedbackId"),
    feedbackTitle: pick("feedbackTitle"),
    routineId: pick("routineId"),
    routineTitle: pick("routineTitle"),
    viewId: pick("viewId"),
    viewName: pick("viewName"),
    cycleId: pick("cycleId"),
    cycleLabel: pick("cycleLabel"),
    pageId: pick("pageId"),
    pageTitle: pick("pageTitle"),
    pageIcon: pick("pageIcon"),
  };
  const hasAnything = Object.values(ctx).some((v) => v !== undefined);
  return hasAnything ? ctx : null;
}

/** The “@” written in the message, resolved on the client side. Same confidence as the
 * context: they are only used to name, never to provide access. */
function parseMentions(raw: unknown): AssistantMention[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .filter(
      (v) =>
        MENTION_TYPES.has(v.type as string) &&
        typeof v.id === "string" &&
        v.id.length <= 100 &&
        typeof v.label === "string" &&
        v.label.length > 0 &&
        v.label.length <= 200,
    )
    .slice(0, 20)
    .map((v) => ({
      type: v.type as AssistantMention["type"],
      id: v.id as string,
      label: v.label as string,
      ...(typeof v.avatarSeed === "string" && v.avatarSeed.length <= 100
        ? { avatarSeed: v.avatarSeed }
        : {}),
      ...(typeof v.color === "string" && v.color.length <= 32
        ? { color: v.color }
        : {}),
    }));
}

/** Resolution “@Nom → id” attached to the message which bears the mentions: Numo
 * can assign or target without re-searching the name, and the line survives in
 * the history since it is recalculated from the persisted metadata. */
function mentionsNote(metadata: unknown): string {
  const list = parseMentions(
    (metadata as { mentions?: unknown } | null)?.mentions
  );
  if (list.length === 0) return "";
  const parts = list.map((m) => {
    if (m.type === "member") return `@${m.label} = team member (user id: ${m.id})`;
    if (m.type === "project") return `@${m.label} = project (id: ${m.id})`;
    if (m.type === "issue") return `@${m.label} = issue (id: ${m.id})`;
    if (m.type === "page") {
      return `@${m.label} = wiki page (page id: ${m.id}) — read it with get_page`;
    }
    return `@${m.label} = objective (id: ${m.id})`;
  });
  return `\n\n[Mentions in this message: ${parts.join("; ")}]`;
}

export async function POST(request: NextRequest) {
  // getAuthedUser rather than a direct getUser(): it is he who carries the gate
  // Global MFA (aal2) and 503 “instance unreachable” — a protected account
  // by TOTP should not be able to talk to the assistant in aal1 (MIN-118).
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const rateLimit = checkSessionRateLimit(
    user.id,
    "assistant-chat",
    ASSISTANT_CHAT_RATE_LIMIT
  );
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many requests", retry_after: rateLimit.retryAfter },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfter) },
      }
    );
  }

  // Plan usage budget (MIN-72) — pre-flight before any LLM call.
  try {
    await ensureUsageBudget(user.id, "assistant");
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    throw err;
  }

  let body: AssistantChatRequest;
  try {
    const parsed: unknown = await request.json();
    // Non-object body (null, string…): refused here rather than crashing further down.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as AssistantChatRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Coerced root fields: Wacky types should neither crash nor terminate
  // in a query. A uuid is 36 characters long — beyond 100, forged body.
  // The message is limited by sanitizeAssistantMessageContent (12,000).
  const projectId =
    typeof body.projectId === "string" && body.projectId ? body.projectId : undefined;
  const conversationId =
    typeof body.conversationId === "string" && body.conversationId
      ? body.conversationId
      : undefined;
  if ((projectId?.length ?? 0) > 100 || (conversationId?.length ?? 0) > 100) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message : "";
  let pageContext = parsePageContext(body.pageContext);
  const mentions = parseMentions(body.mentions);
  const command = parseCommand(body.command);
  if (!message.trim()) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }
  const sanitizedUserMessage = sanitizeAssistantMessageContent(message);

  // Shell attachments: the client uploaded them under its own chat/ prefix;
  // the descriptors ride the request and live on the message's metadata.
  // FILES only — the shell has no link composer, and a chat attachment has no
  // DB row to carry a link's url anyway.
  const parsedResources = parseResourcesInput(
    body.attachments,
    `chat/${user.id}/`,
    5
  );
  if (parsedResources === null) {
    return Response.json({ error: "Invalid attachments" }, { status: 400 });
  }
  const attachments = parsedResources.filter(
    (a): a is AttachmentInput => a.kind !== "link"
  );

  const service = getServiceClient();

  const aiRuntime = await resolveAiRuntime({
    userId: user.id,
    modelKey: "assistant_model",
    surface: "assistant",
  });
  const model = aiRuntime.model;

  // Locale from the NEXT_LOCALE cookie (same chain as the rest of the app).
  // Resolved BEFORE the stream starts — next-intl needs the request context.
  const locale = await getLocale();
  // Same for error messages: the translator is captured here then called
  // from the stream, where the request context is no longer available.
  const tApi = await getTranslations("ApiErrors");

  // Where Numo-created issues land without an explicit status — the user's
  // Account → Preferences choice (defaults to triage).
  const numoDefaultStatus = resolveNumoDefaultStatus(user.user_metadata);

  // Fetch project (only when projectId is provided — project-scoped mode).
  // RLS does the access check: an invisible project reads as not found.
  let project: { id: string; name: string; key: string; owner_id: string } | null =
    null;
  if (projectId) {
    const { data } = await supabase
      .from("projects")
      .select("id, name, key, owner_id")
      .eq("id", projectId)
      .is("deleted_at", null)
      .single();

    if (!data) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }
    project = data;
  }

  // When the page context points at another project (stale client state),
  // drop it rather than confusing the prompt.
  if (pageContext?.projectId && projectId && pageContext.projectId !== projectId) {
    pageContext = null;
  }
  // An issue in context must be visible to the user (RLS) — drop it otherwise.
  if (pageContext?.issueId) {
    const { data: ctxIssue } = await supabase
      .from("issues")
      .select("id")
      .is("deleted_at", null)
      .eq("id", pageContext.issueId)
      .maybeSingle();
    if (!ctxIssue) pageContext = null;
  }

  // Create or fetch conversation
  let convId = conversationId;
  // Summary of the title by a small model: launched without being expected (the sidebar has
  // already the truncated fallback), then waited before closing the flow — that's what
  // guarantees that it succeeds without delaying the first token of the response.
  let titleDone: Promise<void> | null = null;
  if (!convId) {
    const title = fallbackShortTitle(sanitizedUserMessage);
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .insert({
        project_id: projectId ?? null,
        user_id: user.id,
        title,
      })
      .select("id")
      .single();

    if (convError || !conv) {
      return Response.json(
        { error: tApi("conversationCreateFailed") },
        { status: 500 }
      );
    }
    convId = conv.id;

    const newConvId = conv.id as string;
    titleDone = generateShortTitle({
      text: sanitizedUserMessage,
      kind: "conversation",
      locale,
      usage: {
        feature: "numo_chat",
        // It is the author of the message who pays, like the chat trick that follows.
        userId: user.id,
        projectId,
        conversationId: newConvId,
      },
    })
      .then(async (generated) => {
        if (!generated || generated === title) return;
        await service
          .from("conversations")
          .update({ title: generated })
          .eq("id", newConvId)
          .eq("user_id", user.id);
      })
      .catch((err) => {
        console.error("[numo-title] failed:", (err as Error).message);
      });
  } else {
    // Check for concurrent generation
    let convQuery = supabase
      .from("conversations")
      .select("id, status")
      .eq("id", convId)
      .eq("user_id", user.id);
    if (projectId) {
      convQuery = convQuery.eq("project_id", projectId);
    } else {
      convQuery = convQuery.is("project_id", null);
    }
    const { data: existingConversation, error: existingConversationError } =
      await convQuery.single();

    if (existingConversationError || !existingConversation) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }

    if (existingConversation.status === "generating") {
      return Response.json(
        { error: "Conversation is still processing", code: "already_generating" },
        { status: 409 }
      );
    }

    // Update conversation timestamp after ownership/project validation.
    const { error: updateError } = await service
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", convId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Failed to update conversation timestamp:", updateError);
    }
  }

  // Set conversation status to generating
  await service
    .from("conversations")
    .update({ status: "generating", error_message: null })
    .eq("id", convId)
    .eq("user_id", user.id);

  // Save user message. Persist the page context (open issue, board tab…) so
  // the chat can render a context badge above this bubble — null for plain sends.
  const { error: userMsgError } = await supabase.from("assistant_messages").insert({
    conversation_id: convId,
    role: "user",
    content: sanitizedUserMessage,
    context: pageContext,
    metadata: {
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(mentions.length > 0 ? { mentions } : {}),
      ...(command ? { command } : {}),
    },
  });

  if (userMsgError) {
    console.error("Failed to save user message:", userMsgError);
    await service
      .from("conversations")
      .update({ status: "idle" })
      .eq("id", convId);
    return Response.json({ error: tApi("messageSaveFailed") }, { status: 500 });
  }

  // Build system prompt and select tool set based on mode
  let systemPrompt: string;
  let activeTools: AssistantToolDef[];

  if (project) {
    // ── Project-scoped mode ──────────────────────────────────────────
    const promptProject = await gatherProjectPromptContext({
      supabase,
      service,
      project,
    });
    systemPrompt = buildSystemPrompt(promptProject, locale, numoDefaultStatus);
    activeTools = ASSISTANT_TOOLS;
  } else {
    // ── Global mode ──────────────────────────────────────────────────
    systemPrompt = buildGlobalSystemPrompt(locale, numoDefaultStatus);
    activeTools = GLOBAL_ASSISTANT_TOOLS;
  }

  // Web search: guilty of an admin flag. Cut off, the tool is not even
  // proposed (otherwise the model burns a round to be refused).
  const webSearchEnabled = await isWebSearchEnabled();
  if (!webSearchEnabled) activeTools = withoutWebSearch(activeTools);

  // What the user is currently viewing. In project mode that's the open issue/
  // objective/view; in global mode it's the cross-project view or cycle. The
  // block renders only the lines that apply, so it's safe in both modes.
  if (pageContext) {
    systemPrompt += `\n${buildPageContextBlock(pageContext)}`;
  }

  // User time (MIN-185): the time zone comes from the browser, with the
  // query, because it doesn't exist anywhere else. Without him, a routine
  // requested “at 1 p.m.” leaves in UTC and runs nearby, every Monday.
  const timezone =
    typeof body.timezone === "string" && body.timezone.length <= 64
      ? body.timezone
      : "";
  if (timezone) systemPrompt += buildClockBlock(timezone);

  // Load conversation history
  const { data: history } = await supabase
    .from("assistant_messages")
    .select("role, content, tool_calls, tool_call_id, tool_name, metadata")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })
    .limit(30);

  // Detect caching support via OpenRouter pricing metadata — memoised per process.
  const apiKey = aiRuntime.apiKey;
  const supportsCache =
    aiRuntime.provider === "openrouter" && (await modelSupportsCaching(model, apiKey));
  const systemMessage: ChatMessage = supportsCache
    ? {
        role: "system",
        content: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
      }
    : { role: "system", content: systemPrompt };

  const chatMessages: ChatMessage[] = [systemMessage];

  // Attachments persisted on a user row's metadata (validated at write time).
  const rowAttachments = (msg: { role: string; metadata: unknown }): AttachmentInput[] => {
    if (msg.role !== "user") return [];
    const meta = msg.metadata as { attachments?: unknown } | null;
    return Array.isArray(meta?.attachments)
      ? (meta.attachments as AttachmentInput[])
      : [];
  };

  if (history) {
    // Heavy parts (PDF base64, CSV excerpts) go only with the LATEST user
    // message; older images stay (cheap signed URLs), the rest degrade to
    // text notes inside buildAttachmentParts.
    const lastUserIdx = history.reduce(
      (acc, m, i) => (m.role === "user" ? i : acc),
      -1
    );
    const modalities = history.some((m) => rowAttachments(m).length > 0)
      ? aiRuntime.provider === "openrouter"
        ? await getModelInputModalities(model, apiKey)
        : new Set(["text"])
      : null;

    for (const [i, msg] of history.entries()) {
      const sanitized =
        sanitizeAssistantMessageContent(msg.content) +
        (msg.role === "user"
          ? mentionsNote(msg.metadata) + commandNote(msg.metadata)
          : "");
      const atts = rowAttachments(msg);
      let content: string | ChatContentPart[] = sanitized;
      if (atts.length > 0 && modalities) {
        content = [
          { type: "text", text: sanitized },
          ...(await buildAttachmentParts(service, atts, {
            modalities,
            includeHeavy: i === lastUserIdx,
          })),
        ];
      }
      chatMessages.push({
        role: msg.role as ChatMessage["role"],
        content,
        tool_calls: msg.tool_calls || undefined,
        tool_call_id: msg.tool_call_id || undefined,
        name: msg.tool_name || undefined,
      });
    }
  }

  // Capture convId in a const for the closure (always defined at this point)
  const finalConvId = convId!;

  // A ledger run for THIS answer: loop calls and possible
  // web searches (written during the tour, not at the end) share it.
  const runId = newRunId();

  // Stream response with server-side resilience
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emitter = createSafeEmitter(controller, encoder);

      // Timeout protection
      const timeout = setTimeout(async () => {
        await service
          .from("conversations")
          .update({
            status: "error",
            error_message: "Processing timed out",
          })
          .eq("id", finalConvId)
          .eq("status", "generating");
      }, PROCESSING_TIMEOUT_MS);

      try {
        emitter.emit("conversation_id", { conversationId: finalConvId });

        const result = await processChat(chatMessages, activeTools, emitter, {
          projectId: projectId ?? null,
          userId: user.id,
          supabase,
          service,
          locale,
          numoDefaultStatus,
          model,
          aiRuntime,
          conversationId: finalConvId,
          webSearch: webSearchEnabled ? { runId, used: 0 } : undefined,
        });

        clearTimeout(timeout);

        // Cost tracking: each round of the loop is an LLM call; they share
        // the same runId (this Numo response = one run). Best effort, doesn't block anything.
        if (result.generations.length > 0) {
          await recordAiUsage(
            result.generations.map((g, i) => ({
              runId,
              seq: i,
              feature: "numo_chat" as const,
              provider: aiRuntime.provider,
              keyMode: aiRuntime.mode,
              model: g.model,
              generationId: g.generationId,
              promptTokens: g.promptTokens,
              completionTokens: g.completionTokens,
              totalTokens: g.totalTokens,
              cost: g.cost,
              // The budget spoiled in pre-flight is that of `user`: it is therefore him
              // who pays, including on someone else's project.
              billTo: { userId: user.id },
              projectId: projectId ?? null,
              conversationId: finalConvId,
            }))
          );
        }

        // Save final assistant message (text-only response after tools)
        if (result.fullContent) {
          const { data: savedMsg } = await service
            .from("assistant_messages")
            .insert({
              conversation_id: finalConvId,
              role: "assistant",
              content: result.fullContent,
            })
            .select("id")
            .single();

          if (savedMsg) {
            emitter.emit("message_complete", { message_id: savedMsg.id });
          }
        }

        // Set conversation status back to idle
        await service
          .from("conversations")
          .update({ status: "idle", error_message: null })
          .eq("id", finalConvId);

        // The title is gone at the time of creation: we don't leave it
        // hang beyond the answer (the function dies with the flow).
        await titleDone;

        emitter.emit("done", {});
        emitter.close();
      } catch (err) {
        clearTimeout(timeout);
        const errorMessage = err instanceof Error ? err.message : tApi("unexpected");

        // Set conversation status to error
        await service
          .from("conversations")
          .update({ status: "error", error_message: errorMessage })
          .eq("id", finalConvId);

        // Same on the error path: a conversation that failed keeps its
        // title, this is even what allows you to find it to try again.
        await titleDone;

        emitter.emit("error", { message: errorMessage });
        emitter.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
