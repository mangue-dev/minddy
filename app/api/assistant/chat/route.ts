import { NextRequest } from "next/server";
import { getLocale } from "next-intl/server";
import { createSupabaseFromRequest } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValues } from "@/lib/server/app-config";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import type {
  AssistantChatRequest,
  AssistantPageContext,
} from "@/lib/assistant-types";
import { createSafeEmitter } from "@/lib/server/assistant/sse";
import { sanitizeAssistantMessageContent } from "@/lib/server/assistant/sanitize";
import {
  ASSISTANT_TOOLS,
  GLOBAL_ASSISTANT_TOOLS,
  type AssistantToolDef,
} from "@/lib/server/assistant/tools";
import {
  buildGlobalSystemPrompt,
  buildPageContextBlock,
  buildSystemPrompt,
} from "@/lib/server/assistant/prompt";
import { gatherProjectPromptContext } from "@/lib/server/assistant/prompt-context";
import {
  modelSupportsCaching,
  processChat,
  type ChatMessage,
} from "@/lib/server/assistant/loop";
import { resolveNumoDefaultStatus } from "@/lib/numo-default-status";

export const runtime = "nodejs";
export const maxDuration = 300;

const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const ASSISTANT_CHAT_RATE_LIMIT = { limit: 20 };
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

/** Validate the untrusted client-sent page context (prompt-only trust: every
 *  write it could lead to is access-gated in executeTool / lib/server). */
function parsePageContext(raw: unknown): AssistantPageContext | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const pick = (key: string): string | undefined =>
    typeof obj[key] === "string" && (obj[key] as string).length <= 500
      ? (obj[key] as string)
      : undefined;
  const ctx: AssistantPageContext = {
    projectId: pick("projectId"),
    onglet: obj.onglet === "my" || obj.onglet === "all" ? obj.onglet : undefined,
    issueId: pick("issueId"),
    issueIdentifier: pick("issueIdentifier"),
    issueTitle: pick("issueTitle"),
    objectiveId: pick("objectiveId"),
    objectiveName: pick("objectiveName"),
    viewId: pick("viewId"),
    viewName: pick("viewName"),
  };
  const hasAnything = Object.values(ctx).some((v) => v !== undefined);
  return hasAnything ? ctx : null;
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  let body: AssistantChatRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId, message, conversationId } = body;
  let pageContext = parsePageContext(body.pageContext);
  if (!message?.trim()) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }
  const sanitizedUserMessage = sanitizeAssistantMessageContent(message);

  const service = getServiceClient();

  // Model comes from app_config (DB-configured, not an env var) — swappable
  // without a redeploy thanks to the 60s in-process cache.
  const modelCfg = await getAppConfigValues(["assistant_model", "fallback_model"]);
  const model =
    modelCfg["assistant_model"]?.trim() ||
    modelCfg["fallback_model"]?.trim() ||
    DEFAULT_MODEL;

  // Locale from the NEXT_LOCALE cookie (same chain as the rest of the app).
  // Resolved BEFORE the stream starts — next-intl needs the request context.
  const locale = await getLocale();

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
      .eq("id", pageContext.issueId)
      .maybeSingle();
    if (!ctxIssue) pageContext = null;
  }

  // Create or fetch conversation
  let convId = conversationId;
  if (!convId) {
    const title = sanitizedUserMessage.slice(0, 100);
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
        { error: "Failed to create conversation" },
        { status: 500 }
      );
    }
    convId = conv.id;
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
  });

  if (userMsgError) {
    console.error("Failed to save user message:", userMsgError);
    await service
      .from("conversations")
      .update({ status: "idle" })
      .eq("id", convId);
    return Response.json({ error: "Failed to save message" }, { status: 500 });
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

  // What the user is currently viewing — only meaningful in project mode
  // (that's where issues/objectives live).
  if (pageContext && project) {
    systemPrompt += `\n${buildPageContextBlock(pageContext)}`;
  }

  // Load conversation history
  const { data: history } = await supabase
    .from("assistant_messages")
    .select("role, content, tool_calls, tool_call_id, tool_name")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })
    .limit(30);

  // Detect caching support via OpenRouter pricing metadata — memoised per process.
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  const supportsCache = await modelSupportsCaching(model, apiKey);
  const systemMessage: ChatMessage = supportsCache
    ? ({
        role: "system",
        content: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
      } as unknown as ChatMessage)
    : { role: "system", content: systemPrompt };

  const chatMessages: ChatMessage[] = [systemMessage];

  if (history) {
    for (const msg of history) {
      chatMessages.push({
        role: msg.role as ChatMessage["role"],
        content: sanitizeAssistantMessageContent(msg.content),
        tool_calls: msg.tool_calls || undefined,
        tool_call_id: msg.tool_call_id || undefined,
        name: msg.tool_name || undefined,
      });
    }
  }

  // Capture convId in a const for the closure (always defined at this point)
  const finalConvId = convId!;

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
          conversationId: finalConvId,
        });

        clearTimeout(timeout);

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

        emitter.emit("done", {});
        emitter.close();
      } catch (err) {
        clearTimeout(timeout);
        const errorMessage = err instanceof Error ? err.message : "Unknown error";

        // Set conversation status to error
        await service
          .from("conversations")
          .update({ status: "error", error_message: errorMessage })
          .eq("id", finalConvId);

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
