import "server-only";

import type { AssistantToolCall } from "@/lib/assistant-types";
import {
  recordAiUsage,
  parseOpenRouterUsage,
  OPENROUTER_USAGE_INCLUDE,
  type OpenRouterUsage,
  type NormalizedUsage,
} from "@/lib/server/ai-usage";
import {
  chatCompletionsUrl,
  getAgentProvider,
  DEFAULT_AGENT_PROVIDER,
  type AgentProviderId,
} from "@/lib/agent-providers";
import type { AgentToolDef } from "./tools";
import { pruneToolOutputs } from "./prune";
import { markSystemPromptCache } from "./caching";
import {
  estimateTokens,
  planCompaction,
  serializeForSummary,
  SUMMARIZE_INSTRUCTION,
  COMPACT_SUMMARY_PREFIX,
} from "./compact";
import {
  AGENT_COMPACT_TOKEN_THRESHOLD,
  AGENT_COMPACT_KEEP_RECENT_BYTES,
  AGENT_COMPACT_MIN_BUDGET_MS,
} from "@/lib/agent-models";

/**
 * Boucle agentique de l'agent de code (MIN-46) — le « cerveau ». Calquée sur
 * `lib/server/assistant/loop.ts` (processChat) : streaming OpenRouter,
 * accumulation des tool-calls par index, exécution, résultats re-injectés,
 * on reboucle. Différences clés :
 *  - SUSPEND au SOMMET de chaque round si on dépasse la soft-deadline du chunk
 *    (frontière sûre : les résultats du round précédent sont déjà dans messages,
 *    aucun appel en vol) → l'appelant persiste le checkpoint et reprend au chunk
 *    suivant (handoff multi-jobs Vercel, comme AutoKap).
 *  - pas de persistance assistant_messages : `messages` EST le checkpoint.
 *  - chaque appel → `recordAiUsage(feature:'agent_code', run_id)` ; chaque étape
 *    → `emit` vers agent_run_events (live view).
 *  - `finish` termine (→ ouverture de PR par l'appelant) ; `ask_user` met en
 *    pause (statut needs_input).
 * Les tools « métier » (read_file/write_file/run_command…) sont délégués à
 * `execTool` (fourni par execute.ts, qui détient le Sandbox).
 */

const MAX_ROUNDS_PER_CHUNK = 60;
/** Garde-fou : nombre max de compactions par chunk (convergence normalement immédiate). */
const MAX_COMPACTIONS_PER_CHUNK = 3;

/** Un message du protocole chat OpenRouter (identique à celui de processChat). */
export interface AgentChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: AssistantToolCall[];
  tool_call_id?: string;
  name?: string;
}

export type AgentEventType =
  | "status"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "commit"
  | "pr_opened"
  | "error"
  | "summary"
  | "user_message";

export type EmitAgentEvent = (
  type: AgentEventType,
  payload: Record<string, unknown>,
) => Promise<void> | void;

export type ExecuteAgentTool = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ result: unknown; success: boolean }>;

export interface AgentFinish {
  summary: string;
  prTitle?: string;
  prBody?: string;
}

export interface RunAgentLoopParams {
  /** Historique (system + user, ou rehydraté depuis le checkpoint). MUTÉ + renvoyé. */
  messages: AgentChatMessage[];
  tools: AgentToolDef[];
  model: string;
  apiKey: string;
  /** Base URL OpenAI-compatible du provider (sans /chat/completions). */
  baseUrl: string;
  /** Provider effectif (OpenRouter par défaut) — pilote headers/body. */
  provider?: AgentProviderId;
  runId: string;
  userId?: string | null;
  projectId?: string | null;
  /** Budget du chunk courant, mesuré depuis l'entrée dans la boucle. */
  softDeadlineMs: number;
  execTool: ExecuteAgentTool;
  /**
   * Draine les messages de steering en attente (file `agent_run_messages`).
   * Appelé au SOMMET de chaque round : les messages renvoyés sont injectés comme
   * messages `user` avant le prochain appel LLM → orientation à chaud + reprise
   * d'un `ask_user`. Optionnel (absent = pas de steering).
   */
  pullSteering?: () => Promise<string[]>;
  emit: EmitAgentEvent;
  /** Index de départ des lignes ai_usage (ordre d'affichage). */
  usageSeqStart?: number;
  signal?: AbortSignal;
}

export interface AgentLoopResult {
  status: "completed" | "suspended" | "needs_input";
  messages: AgentChatMessage[];
  finish?: AgentFinish;
  question?: string;
  costUsd: number;
  usageSeqEnd: number;
  rounds: number;
}

function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function previewResult(result: unknown): string {
  return cap(typeof result === "string" ? result : JSON.stringify(result), 400);
}

/** Résumé compact des args d'un tool pour le live view (jamais le contenu de fichier). */
function toolArgSummary(name: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (name) {
    case "read_file":
    case "list_dir":
    case "write_file":
    case "edit_file":
      return { path: String(args.path ?? "") };
    case "glob":
    case "grep":
      return { pattern: String(args.pattern ?? "") };
    case "run_command":
      return { command: cap(String(args.command ?? ""), 100) };
    case "ask_user":
      return { question: cap(String(args.question ?? ""), 300) };
    default:
      return {};
  }
}

interface StreamChunk {
  id?: string;
  model?: string;
  usage?: OpenRouterUsage;
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
}

interface StreamResult {
  content: string;
  toolCalls: AssistantToolCall[];
  generationId: string | null;
  modelUsed: string | null;
  usage: NormalizedUsage;
}

/**
 * Un tour de complétion streamée (endpoint OpenAI-compatible). Accumule contenu,
 * tool-calls et usage. Le corps/headers sont ajustés au provider via son
 * `requestProfile` (le comptage de coût OpenRouter, les headers d'attribution et
 * `max_tokens` ne sont envoyés qu'aux providers qui les tolèrent — cf.
 * lib/agent-providers.ts).
 */
async function streamCompletion(opts: {
  apiKey: string;
  model: string;
  baseUrl: string;
  provider: AgentProviderId;
  messages: AgentChatMessage[];
  tools: AgentToolDef[];
  signal?: AbortSignal;
}): Promise<StreamResult> {
  const profile = getAgentProvider(opts.provider)?.requestProfile ?? {};

  const requestBody: Record<string, unknown> = {
    model: opts.model,
    // Prompt caching : marque le système d'un cache breakpoint pour les providers
    // qui l'acceptent (OpenRouter). Transient — l'historique reste en content:string.
    messages: profile.promptCaching ? markSystemPromptCache(opts.messages) : opts.messages,
    stream: true,
  };
  if (profile.streamUsage) requestBody.stream_options = { include_usage: true };
  if (profile.usageAccounting) requestBody.usage = OPENROUTER_USAGE_INCLUDE;
  if (profile.maxTokens) requestBody.max_tokens = profile.maxTokens;
  if (opts.tools.length > 0) requestBody.tools = opts.tools;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.apiKey}`,
    "Content-Type": "application/json",
  };
  if (profile.attribution) {
    headers["HTTP-Referer"] = "https://minddy.app";
    headers["X-Title"] = "Numo agent (minddy)";
  }
  if (profile.anthropicVersion) headers["anthropic-version"] = "2023-06-01";

  const response = await fetch(chatCompletionsUrl(opts.baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
    signal: opts.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM error (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body from LLM");

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let generationId: string | null = null;
  let modelUsed: string | null = null;
  let usageRaw: OpenRouterUsage | null = null;
  const acc = new Map<number, { id: string; name: string; arguments: string }>();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      let parsed: StreamChunk;
      try {
        parsed = JSON.parse(data) as StreamChunk;
      } catch {
        continue;
      }
      if (parsed.id && !generationId) generationId = parsed.id;
      if (parsed.model) modelUsed = parsed.model;
      if (parsed.usage) usageRaw = parsed.usage;
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) content += delta.content;
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!acc.has(idx)) {
            acc.set(idx, { id: tc.id || "", name: tc.function?.name || "", arguments: "" });
          }
          const a = acc.get(idx)!;
          if (tc.id) a.id = tc.id;
          if (tc.function?.name) a.name = tc.function.name;
          if (tc.function?.arguments) a.arguments += tc.function.arguments;
        }
      }
    }
  }

  const toolCalls: AssistantToolCall[] = [...acc.values()].map((a) => ({
    id: a.id,
    type: "function",
    function: { name: a.name, arguments: a.arguments },
  }));

  return { content, toolCalls, generationId, modelUsed, usage: parseOpenRouterUsage(usageRaw) };
}

/**
 * Fait tourner l'agent jusqu'à : terminé (`finish` / arrêt naturel), suspendu
 * (soft-deadline / plafond de rounds), ou en attente utilisateur (`ask_user`).
 * Renvoie le checkpoint (`messages`) à persister, le coût du chunk et l'issue.
 */
export async function runAgentLoop(params: RunAgentLoopParams): Promise<AgentLoopResult> {
  const { messages, tools, model, apiKey, baseUrl, runId, execTool, emit } = params;
  const provider = params.provider ?? DEFAULT_AGENT_PROVIDER;
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  let seq = params.usageSeqStart ?? 0;
  let costUsd = 0;
  let round = 0;
  let compactions = 0;

  for (;;) {
    // Frontière sûre : suspend AVANT le prochain appel LLM.
    if (elapsed() >= params.softDeadlineMs || round >= MAX_ROUNDS_PER_CHUNK) {
      return { status: "suspended", messages, costUsd, usageSeqEnd: seq, rounds: round };
    }
    round++;

    // Steering : draine les messages user en attente et les injecte comme messages
    // `user` AVANT le prochain appel (frontière sûre, aucun appel en vol). Sert à
    // orienter un run en cours ET à répondre à un `ask_user` (reprise du run).
    if (params.pullSteering) {
      const injected = await params.pullSteering();
      for (const text of injected) {
        if (!text.trim()) continue;
        messages.push({ role: "user", content: text });
        await emit("user_message", { text: cap(text, 4000) });
      }
    }

    // Durcissement : élague les sorties de tools périmées (protège les ~40 Ko
    // récents). Réduit le coût par appel et la taille du checkpoint. No-op tant
    // qu'il n'y a pas ≥20 Ko à récupérer → sans effet sur les runs courts.
    pruneToolOutputs(messages);

    // Compaction : si l'historique reste énorme après élagage et qu'il reste du
    // budget, résume le milieu périmé en un message unique (préserve système +
    // queue récente). Rare — ne se déclenche que sur les runs très longs.
    if (
      compactions < MAX_COMPACTIONS_PER_CHUNK &&
      params.softDeadlineMs - elapsed() > AGENT_COMPACT_MIN_BUDGET_MS &&
      estimateTokens(messages) >= AGENT_COMPACT_TOKEN_THRESHOLD
    ) {
      const plan = planCompaction(messages, { keepRecentBytes: AGENT_COMPACT_KEEP_RECENT_BYTES });
      if (plan) {
        // Compte la TENTATIVE (pas seulement le succès) : un résumé vide ne doit pas
        // relancer un sous-appel LLM payant à chaque round sans plafond.
        compactions++;
        const tokensBefore = estimateTokens(messages);
        const summaryStream = await streamCompletion({
          apiKey,
          model,
          baseUrl,
          provider,
          messages: [
            { role: "system", content: SUMMARIZE_INSTRUCTION },
            { role: "user", content: serializeForSummary(plan.toSummarize) },
          ],
          tools: [],
          signal: params.signal,
        });
        await recordAiUsage({
          runId,
          seq: seq++,
          feature: "agent_code",
          model: summaryStream.modelUsed ?? model,
          generationId: summaryStream.generationId,
          promptTokens: summaryStream.usage.promptTokens,
          completionTokens: summaryStream.usage.completionTokens,
          totalTokens: summaryStream.usage.totalTokens,
          cost: summaryStream.usage.cost,
          userId: params.userId ?? null,
          projectId: params.projectId ?? null,
        });
        costUsd += summaryStream.usage.cost ?? 0;

        const summaryText = summaryStream.content.trim();
        if (summaryText) {
          const summaryMsg: AgentChatMessage = {
            role: "user",
            content: `${COMPACT_SUMMARY_PREFIX}\n\n${summaryText}`,
          };
          const rebuilt: AgentChatMessage[] = [
            ...(plan.systemMessage ? [plan.systemMessage] : []),
            summaryMsg,
            ...plan.tail,
          ];
          messages.splice(0, messages.length, ...rebuilt);
          await emit("status", {
            phase: "compacted",
            tokensBefore,
            tokensAfter: estimateTokens(messages),
          });
        }
      }
    }

    const stream = await streamCompletion({
      apiKey,
      model,
      baseUrl,
      provider,
      messages,
      tools,
      signal: params.signal,
    });

    await recordAiUsage({
      runId,
      seq: seq++,
      feature: "agent_code",
      model: stream.modelUsed ?? model,
      generationId: stream.generationId,
      promptTokens: stream.usage.promptTokens,
      completionTokens: stream.usage.completionTokens,
      totalTokens: stream.usage.totalTokens,
      cost: stream.usage.cost,
      userId: params.userId ?? null,
      projectId: params.projectId ?? null,
    });
    costUsd += stream.usage.cost ?? 0;

    if (stream.content.trim()) await emit("thinking", { text: cap(stream.content, 2000) });

    // Arrêt naturel sans tool-call → tâche considérée terminée.
    if (stream.toolCalls.length === 0) {
      messages.push({ role: "assistant", content: stream.content || "" });
      const summary = stream.content.trim() || "Changes applied.";
      await emit("summary", { text: cap(summary, 2000) });
      return {
        status: "completed",
        messages,
        finish: { summary },
        costUsd,
        usageSeqEnd: seq,
        rounds: round,
      };
    }

    messages.push({ role: "assistant", content: stream.content || null, tool_calls: stream.toolCalls });

    // `finish` court-circuite (terminal).
    const finishCall = stream.toolCalls.find((t) => t.function.name === "finish");
    if (finishCall) {
      const args = safeParse(finishCall.function.arguments);
      const finish: AgentFinish = {
        summary: String(args.summary ?? "").trim() || "Changes applied.",
        prTitle: typeof args.pr_title === "string" ? args.pr_title : undefined,
        prBody: typeof args.pr_body === "string" ? args.pr_body : undefined,
      };
      await emit("summary", { text: finish.summary });
      return { status: "completed", messages, finish, costUsd, usageSeqEnd: seq, rounds: round };
    }

    let pauseQuestion: string | null = null;
    for (const tc of stream.toolCalls) {
      const name = tc.function.name;
      const args = safeParse(tc.function.arguments);
      await emit("tool_call", { id: tc.id, name, ...toolArgSummary(name, args) });

      if (name === "ask_user") {
        const question = String(args.question ?? "").trim();
        pauseQuestion = question;
        const res = { status: "awaiting_user_response", question };
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(res) });
        await emit("tool_result", { id: tc.id, name, success: true });
        continue;
      }

      let result: unknown;
      let success: boolean;
      try {
        ({ result, success } = await execTool(name, args));
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
        success = false;
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content: cap(JSON.stringify(result), 6000) });
      await emit("tool_result", { id: tc.id, name, success, preview: previewResult(result) });
    }

    if (pauseQuestion !== null) {
      return {
        status: "needs_input",
        messages,
        question: pauseQuestion,
        costUsd,
        usageSeqEnd: seq,
        rounds: round,
      };
    }
    // sinon on reboucle
  }
}
