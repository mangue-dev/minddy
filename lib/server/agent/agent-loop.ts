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
import { pruneToolOutputs, headTail } from "./prune";
import { markSystemPromptCache } from "./caching";
import {
  estimateTokens,
  planCompaction,
  serializeForSummary,
  dropOldestRound,
  SUMMARIZE_INSTRUCTION,
  COMPACT_SUMMARY_PREFIX,
} from "./compact";
import {
  AGENT_COMPACT_TOKEN_THRESHOLD,
  AGENT_COMPACT_KEEP_RECENT_BYTES,
  AGENT_COMPACT_MIN_BUDGET_MS,
  AGENT_RUN_TIMEOUT_MS,
} from "@/lib/agent-models";
import {
  StreamError,
  isRetryableStatus,
  isContextLengthError,
  parseRetryAfterMs,
  backoffMs,
  sleep,
  MAX_STREAM_ATTEMPTS,
  MAX_RETRY_WAIT_MS,
  STREAM_IDLE_TIMEOUT_MS,
} from "./retry";

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
/** Garde-fou : nombre max d'élagages de round sur un 400 « contexte trop long » (par appel). */
const MAX_CONTEXT_TRIMS = 4;
/** Tools d'exploration sans effet de bord → parallélisables dans un même round. */
const READ_ONLY_TOOLS = new Set(["read_file", "list_dir", "glob", "grep"]);

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
  | "user_message"
  | "plan_update";

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
  /**
   * Fenêtre de contexte (tokens) du modèle, si connue → seuil de compaction =
   * 75 % de cette fenêtre. Absent = seuil par défaut `AGENT_COMPACT_TOKEN_THRESHOLD`.
   */
  contextWindow?: number | null;
  execTool: ExecuteAgentTool;
  /**
   * Draine les messages de steering en attente (file `agent_run_messages`).
   * Appelé au SOMMET de chaque round : les messages renvoyés sont injectés comme
   * messages `user` avant le prochain appel LLM → orientation à chaud + reprise
   * d'un `ask_user`. Optionnel (absent = pas de steering).
   */
  pullSteering?: () => Promise<string[]>;
  /**
   * Miroir best-effort des états du checklist (tool update_plan) vers le plan de
   * l'issue liée. Appelé après l'event `plan_update`, jamais bloquant (les erreurs
   * sont avalées). Absent = pas de synchro (ex. run hors issue).
   */
  syncPlan?: (steps: PlanStep[]) => Promise<void>;
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

export type PlanStepStatus = "pending" | "in_progress" | "completed" | "cancelled";
export interface PlanStep {
  step: string;
  status: PlanStepStatus;
}

const PLAN_STATUSES = new Set<PlanStepStatus>(["pending", "in_progress", "completed", "cancelled"]);

/** Normalise l'argument `plan` du tool update_plan en étapes valides (borné). */
export function normalizePlan(raw: unknown): PlanStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 40)
    .map((it) => {
      const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
      const step = String(o.step ?? o.text ?? "").slice(0, 300);
      const s = String(o.status ?? "pending");
      const status = PLAN_STATUSES.has(s as PlanStepStatus) ? (s as PlanStepStatus) : "pending";
      return { step, status };
    })
    .filter((s) => s.step.trim().length > 0);
}

/** Résumé compact des args d'un tool pour le live view (jamais le contenu de fichier). */
function toolArgSummary(name: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (name) {
    case "read_file":
    case "list_dir":
    case "write_file":
    case "edit_file":
    case "delete_file":
      return { path: String(args.path ?? "") };
    case "move_file":
      return { from: String(args.from ?? ""), to: String(args.to ?? "") };
    case "apply_edits":
      return { count: Array.isArray(args.changes) ? args.changes.length : 0 };
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
      // Trace de raisonnement (selon provider). Affichée en live, jamais persistée.
      reasoning?: string;
      reasoning_content?: string;
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
  /** Trace de raisonnement streamée (non round-trippée en chat-completions). */
  reasoning: string;
  toolCalls: AssistantToolCall[];
  generationId: string | null;
  modelUsed: string | null;
  usage: NormalizedUsage;
}

/**
 * UN essai de complétion streamée (endpoint OpenAI-compatible). Accumule contenu,
 * tool-calls et usage. Le corps/headers sont ajustés au provider via son
 * `requestProfile`. Deux timers d'annulation : un timeout DUR (`AGENT_RUN_TIMEOUT_MS`)
 * et un timeout d'INACTIVITÉ réarmé à chaque octet SSE (stream figé). Lève une
 * `StreamError` (retryable ou non) que le wrapper `streamCompletion` gère.
 */
async function streamCompletionOnce(opts: {
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

  // Timers d'annulation. `timedOut` distingue un abort « nous » (reprenable) d'un
  // abort externe (annulation utilisateur → non reprenable).
  const controller = new AbortController();
  let timedOut = false;
  const abortTimeout = () => {
    timedOut = true;
    controller.abort();
  };
  const hardTimer = setTimeout(abortTimeout, AGENT_RUN_TIMEOUT_MS);
  let idleTimer = setTimeout(abortTimeout, STREAM_IDLE_TIMEOUT_MS);
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(abortTimeout, STREAM_IDLE_TIMEOUT_MS);
  };
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    let response: Response;
    try {
      response = await fetch(chatCompletionsUrl(opts.baseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err) {
      // Abort (timeout nous → reprenable ; externe → non) ou erreur réseau (reprenable).
      const retryable = timedOut || !opts.signal?.aborted;
      throw new StreamError(`network error: ${(err as Error).message}`, { retryable });
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new StreamError(`LLM error (${response.status}): ${errorText.slice(0, 300)}`, {
        retryable: isRetryableStatus(response.status),
        status: response.status,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after"), Date.now()) ?? undefined,
      });
    }

    const reader = response.body?.getReader();
    if (!reader) throw new StreamError("No response body from LLM", { retryable: true });

    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let reasoning = "";
    let generationId: string | null = null;
    let modelUsed: string | null = null;
    let usageRaw: OpenRouterUsage | null = null;
    const acc = new Map<number, { id: string; name: string; arguments: string }>();

    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        throw new StreamError(`stream interrupted: ${(err as Error).message}`, {
          retryable: timedOut || !opts.signal?.aborted,
        });
      }
      if (chunk.done) break;
      resetIdle();
      buffer += decoder.decode(chunk.value, { stream: true });
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
        if (delta.reasoning) reasoning += delta.reasoning;
        if (delta.reasoning_content) reasoning += delta.reasoning_content;
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

    return { content, reasoning, toolCalls, generationId, modelUsed, usage: parseOpenRouterUsage(usageRaw) };
  } finally {
    clearTimeout(hardTimer);
    clearTimeout(idleTimer);
  }
}

/**
 * Complétion streamée avec REPRISES : retente les erreurs reprenables (429, 5xx,
 * réseau, stream figé) avec backoff (Retry-After sinon exponentiel + jitter).
 * Après épuisement, relève la `StreamError` (l'appelant décide : suspendre le run
 * plutôt qu'échouer si elle est reprenable).
 */
async function streamCompletion(opts: {
  apiKey: string;
  model: string;
  baseUrl: string;
  provider: AgentProviderId;
  messages: AgentChatMessage[];
  tools: AgentToolDef[];
  signal?: AbortSignal;
  /** Deadline absolue (Date.now() ms) du chunk : au-delà, on ne dort pas, on relève. */
  deadlineAt?: number;
}): Promise<StreamResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_STREAM_ATTEMPTS; attempt++) {
    try {
      return await streamCompletionOnce(opts);
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof StreamError ? err.retryable : true;
      if (!retryable || attempt === MAX_STREAM_ATTEMPTS - 1) throw err;
      // Attente plafonnée (un Retry-After absurde ne doit pas nous faire dormir au-
      // delà de maxDuration) ET budget-aware : si dormir puis retenter dépasse la
      // deadline du chunk, on relève → l'appelant suspend (reprise, fonction fraîche).
      const wait = Math.min(
        (err instanceof StreamError ? err.retryAfterMs : undefined) ?? backoffMs(attempt),
        MAX_RETRY_WAIT_MS,
      );
      if (opts.deadlineAt && Date.now() + wait >= opts.deadlineAt) throw err;
      await sleep(wait);
    }
  }
  throw lastErr;
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
  // Seuil de compaction : 75 % de la fenêtre du modèle si connue, sinon défaut.
  const compactThreshold = params.contextWindow
    ? Math.floor(params.contextWindow * 0.75)
    : AGENT_COMPACT_TOKEN_THRESHOLD;
  // Taille de contexte réelle du dernier appel (prompt_tokens rapportés) — plus
  // fiable que l'estimation caractères/4 pour décider de compacter.
  let lastPromptTokens: number | null = null;

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
      (lastPromptTokens ?? estimateTokens(messages)) >= compactThreshold
    ) {
      const plan = planCompaction(messages, { keepRecentBytes: AGENT_COMPACT_KEEP_RECENT_BYTES });
      if (plan) {
        // Compte la TENTATIVE (pas seulement le succès) : un résumé vide ne doit pas
        // relancer un sous-appel LLM payant à chaque round sans plafond.
        compactions++;
        const tokensBefore = estimateTokens(messages);
        try {
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
            deadlineAt: startedAt + params.softDeadlineMs,
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
            const rebuilt: AgentChatMessage[] = [...plan.seedPrefix, summaryMsg, ...plan.tail];
            messages.splice(0, messages.length, ...rebuilt);
            lastPromptTokens = null; // contexte réduit → recalculé au prochain appel
            await emit("status", {
              phase: "compacted",
              tokensBefore,
              tokensAfter: estimateTokens(messages),
            });
          }
        } catch {
          // Compaction best-effort : si le sous-appel de résumé échoue, on continue
          // sans compacter ce round (la tentative est déjà comptée → pas de boucle).
        }
      }
    }

    let stream: StreamResult;
    let contextTrims = 0;
    for (;;) {
      try {
        stream = await streamCompletion({
          apiKey,
          model,
          baseUrl,
          provider,
          messages,
          tools,
          signal: params.signal,
          deadlineAt: startedAt + params.softDeadlineMs,
        });
        break;
      } catch (err) {
        // 400 « contexte trop long » : dernier recours — retire le round le plus
        // ancien (sûr pour l'appariement) et retente le MÊME appel, jusqu'à
        // MAX_CONTEXT_TRIMS. On ne touche ni au système ni au message de tâche.
        if (
          err instanceof StreamError &&
          err.status === 400 &&
          isContextLengthError(err.message) &&
          contextTrims < MAX_CONTEXT_TRIMS &&
          dropOldestRound(messages)
        ) {
          contextTrims++;
          await emit("status", { phase: "context_trim" });
          continue;
        }
        // Erreur transitoire épuisée (429/5xx/réseau) → SUSPENDRE le run (reprise au
        // chunk suivant, fonction fraîche) plutôt qu'échouer. Une erreur fatale (4xx,
        // requête invalide) remonte et échoue le run.
        if (err instanceof StreamError && err.retryable) {
          await emit("status", { phase: "transient_error", message: cap(err.message, 300) });
          return { status: "suspended", messages, costUsd, usageSeqEnd: seq, rounds: round };
        }
        throw err;
      }
    }

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
    // Taille de contexte réelle pour la décision de compaction du prochain round.
    lastPromptTokens = stream.usage.promptTokens ?? lastPromptTokens;

    // Reasoning : affiché en live mais JAMAIS poussé dans `messages` (chat-completions
    // ne le round-trippe pas ; le persister gonflerait/rejouerait le contexte).
    if (stream.reasoning.trim()) await emit("thinking", { text: cap(stream.reasoning, 2000) });
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

    // Fast-path : si TOUS les tool-calls du round sont read-only (exploration), on
    // les exécute EN PARALLÈLE — les tools sont des round-trips réseau au Sandbox.
    // Résultats poussés dans l'ordre d'origine → pairing tool_call↔résultat préservé.
    if (
      stream.toolCalls.length > 1 &&
      stream.toolCalls.every((t) => READ_ONLY_TOOLS.has(t.function.name))
    ) {
      for (const tc of stream.toolCalls) {
        const args = safeParse(tc.function.arguments);
        await emit("tool_call", { id: tc.id, name: tc.function.name, ...toolArgSummary(tc.function.name, args) });
      }
      const outcomes = await Promise.all(
        stream.toolCalls.map(async (tc) => {
          const args = safeParse(tc.function.arguments);
          try {
            const { result, success } = await execTool(tc.function.name, args);
            return { tc, result, success };
          } catch (err) {
            return { tc, result: { error: err instanceof Error ? err.message : String(err) }, success: false };
          }
        }),
      );
      for (const o of outcomes) {
        messages.push({ role: "tool", tool_call_id: o.tc.id, content: headTail(JSON.stringify(o.result), 6000) });
        await emit("tool_result", {
          id: o.tc.id,
          name: o.tc.function.name,
          success: o.success,
          preview: previewResult(o.result),
        });
      }
      continue;
    }

    let pauseQuestion: string | null = null;
    let finishResult: AgentFinish | null = null;
    for (const tc of stream.toolCalls) {
      const name = tc.function.name;
      const args = safeParse(tc.function.arguments);

      // update_plan : tool de contrôle légère — n'émet QUE l'event plan_update (le
      // feed le rend en checklist), répond au tool-call, et ne passe pas au Sandbox.
      if (name === "update_plan") {
        const plan = normalizePlan(args.plan);
        await emit("plan_update", { plan });
        // Miroir vers le plan de l'issue — best-effort, ne bloque jamais le run.
        await params.syncPlan?.(plan).catch(() => {});
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ ok: true }) });
        continue;
      }

      // `finish` est terminal, mais on le CAPTURE et on continue : les tool-calls
      // frères du même tour (edit_file…) doivent d'abord s'exécuter, sinon leurs
      // mutations n'atteignent jamais le Sandbox et la PR décrirait des changements
      // absents. On honore finish APRÈS la boucle (le pause l'emporte s'il survient).
      if (name === "finish") {
        finishResult = {
          summary: String(args.summary ?? "").trim() || "Changes applied.",
          prTitle: typeof args.pr_title === "string" ? args.pr_title : undefined,
          prBody: typeof args.pr_body === "string" ? args.pr_body : undefined,
        };
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ ok: true }) });
        continue;
      }

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
      messages.push({ role: "tool", tool_call_id: tc.id, content: headTail(JSON.stringify(result), 6000) });
      await emit("tool_result", { id: tc.id, name, success, preview: previewResult(result) });
    }

    // Un pause l'emporte sur un finish concurrent (l'agent pose une question).
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

    // finish (honoré APRÈS l'exécution des tool-calls frères) → terminal.
    if (finishResult) {
      await emit("summary", { text: finishResult.summary });
      return { status: "completed", messages, finish: finishResult, costUsd, usageSeqEnd: seq, rounds: round };
    }
    // sinon on reboucle
  }
}
