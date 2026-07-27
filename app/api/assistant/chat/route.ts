import { NextRequest } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { createSupabaseFromRequest } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValues } from "@/lib/server/app-config";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { ensureUsageBudget } from "@/lib/server/usage";
import {
  isPlanLimitError,
  planLimitResponse,
} from "@/lib/server/plan-limit-error";
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
import { parseAttachmentsInput } from "@/lib/server/attachments";
import { resolveNumoDefaultStatus } from "@/lib/numo-default-status";
import type { AttachmentInput } from "@/lib/types";

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
  const ctx: AssistantPageContext = {
    projectId: pick("projectId"),
    onglet: obj.onglet === "my" || obj.onglet === "all" ? obj.onglet : undefined,
    issueId: pick("issueId"),
    issueIds: pickList("issueIds"),
    issueIdentifiers: pickList("issueIdentifiers"),
    issueTitles: pickList("issueTitles"),
    issueIdentifier: pick("issueIdentifier"),
    issueTitle: pick("issueTitle"),
    objectiveId: pick("objectiveId"),
    objectiveName: pick("objectiveName"),
    feedbackId: pick("feedbackId"),
    feedbackTitle: pick("feedbackTitle"),
    viewId: pick("viewId"),
    viewName: pick("viewName"),
    cycleId: pick("cycleId"),
    cycleLabel: pick("cycleLabel"),
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

  // Budget d'usage du plan (MIN-72) — pré-vol avant tout appel LLM.
  try {
    await ensureUsageBudget(user.id);
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    throw err;
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

  // Shell attachments: the client uploaded them under its own chat/ prefix;
  // the descriptors ride the request and live on the message's metadata.
  const attachments = parseAttachmentsInput(
    body.attachments,
    `chat/${user.id}/`,
    5
  );
  if (attachments === null) {
    return Response.json({ error: "Invalid attachments" }, { status: 400 });
  }

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
  // Idem pour les messages d'erreur : le traducteur est capturé ici puis appelé
  // depuis le stream, où le contexte de requête n'est plus disponible.
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
        { error: tApi("conversationCreateFailed") },
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
    metadata: attachments.length > 0 ? { attachments } : {},
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

  // Recherche web : coupable d'un drapeau admin. Coupée, le tool n'est même pas
  // proposé (sinon le modèle brûle un round pour se faire refuser).
  const webSearchEnabled = await isWebSearchEnabled();
  if (!webSearchEnabled) activeTools = withoutWebSearch(activeTools);

  // What the user is currently viewing. In project mode that's the open issue/
  // objective/view; in global mode it's the cross-project view or cycle. The
  // block renders only the lines that apply, so it's safe in both modes.
  if (pageContext) {
    systemPrompt += `\n${buildPageContextBlock(pageContext)}`;
  }

  // Load conversation history
  const { data: history } = await supabase
    .from("assistant_messages")
    .select("role, content, tool_calls, tool_call_id, tool_name, metadata")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })
    .limit(30);

  // Detect caching support via OpenRouter pricing metadata — memoised per process.
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  const supportsCache = await modelSupportsCaching(model, apiKey);
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
      ? await getModelInputModalities(model, apiKey)
      : null;

    for (const [i, msg] of history.entries()) {
      const sanitized = sanitizeAssistantMessageContent(msg.content);
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

  // Un run de ledger pour CETTE réponse : les appels du loop et les éventuelles
  // recherches web (écrites pendant le tour, pas à la fin) le partagent.
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
          conversationId: finalConvId,
          webSearch: webSearchEnabled ? { runId, used: 0 } : undefined,
        });

        clearTimeout(timeout);

        // Suivi des coûts : chaque round du loop est un appel LLM ; ils partagent
        // le même runId (cette réponse Numo = un run). Best-effort, ne bloque rien.
        if (result.generations.length > 0) {
          await recordAiUsage(
            result.generations.map((g, i) => ({
              runId,
              seq: i,
              feature: "numo_chat" as const,
              model: g.model,
              generationId: g.generationId,
              promptTokens: g.promptTokens,
              completionTokens: g.completionTokens,
              totalTokens: g.totalTokens,
              cost: g.cost,
              userId: user.id,
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
