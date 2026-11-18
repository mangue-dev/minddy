import "server-only";

import { assertAiConsent } from "@/lib/server/ai-consent";
import { getAppConfigValues } from "@/lib/server/app-config";
import { stripModelSuffix } from "@/lib/ai-model-config";
import { modelConfigKeys, resolveFromValues } from "@/lib/server/model-config";
import {
  parseOpenRouterUsage,
  recordAiUsage,
  type AiUsageBillTo,
  type NormalizedUsage,
  type OpenRouterUsage,
} from "@/lib/server/ai-usage";
import type { AiSurface } from "@/lib/ai-surfaces";
import { normalizeBaseUrl, type AgentProviderId } from "@/lib/agent-providers";
import {
  handleManagedKeyRejection,
  resolveAiRuntime,
  resolvePlatformApiKey,
  type ResolvedAiRuntime,
} from "@/lib/server/ai-runtime";
import { fetchAiProvider } from "@/lib/server/ai-provider-request";
import { ANTHROPIC_API_VERSION, toAnthropicMessagesBody } from "@/lib/server/anthropic-messages";
import { toResponsesBody } from "@/lib/server/openai-responses";
import {
  aiChatProviderHeaders,
  translateAiChatRequest,
} from "@/lib/ai-chat";
import { providerErrorFromResponse, reportProviderError } from "@/lib/server/ai-provider-errors";

/**
 * Numo web search — the ONLY web path for the app.
 *
 * It goes through the OpenRouter `web` plugin (forced Exa engine), never through a
 * third-party search service: one key, one invoice, one ledger.
 * OpenRouter does not expose an isolated search endpoint — the plugin injects the
 * results into a completion prompt. We therefore make ONE dedicated subcall,
 * on a small model, whose question IS the query: the search remains an explicit
 * tool (the calling model decides when to search) and its cost is a separate
 * ledger line.
 *
 * COST — measured on 2026-07-27, same request, same model:
 * without plugin: usage.cost = $0.0000070
 * with plugin: usage.cost = $0.0050820 (including upstream_inference $0.0000820)
 * The difference is exactly the Exa package ($0.005 per query, up to 10
 * results). In other words `usage.cost` INCLUDES the search: the line
 * `ai_usage` written here counts the real price, without in-house calculation.
 *
 * The engine is pinned to `exa` voluntarily: left free, OpenRouter route
 * to the NATIVE search of the provider (OpenAI, Anthropic, Google, xAI) whose price is a variable passthrough. Exa = flat, predictable price.
 *
 * PERSONAL KEYS (MIN-1021): a search follows the account's language-model
 * route like the turn that asks for it. An OpenRouter key runs the plugin
 * above with the account's model. An Anthropic or OpenAI key searches with the
 * provider's own web search tool (`runNativeWebSearch`), on the account's model
 * and at the account's expense; a failure there is returned as such, never
 * replayed on minddy Cloud. Only a personal provider without a web search of
 * its own (DeepSeek, Mistral, Google's OpenAI-compatible endpoint…) still
 * searches through minddy Cloud.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** `app_config` keys (adjustable from /admin, see lib/ai-model-config.ts). */
export const WEB_SEARCH_MODEL_CONFIG_KEY = "web_search_model";

/** Requested results — the package is the same from 1 to 10, only the prompt increases. */
const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_CAP = 10;

const MAX_QUERY_CHARS = 400;
const MAX_ANSWER_TOKENS = 800;
/** Excerpt kept by source (the calling model already has the summary). */
const MAX_SNIPPET_CHARS = 700;
const TIMEOUT_MS = 45_000;

/**
 * Base of `seq` of the `web_search` lines of a run: outside the band of calls
 * LLM (rounds 0..n) so that a display order remains readable. The
 * code agents already use 1e9 for `sandbox_compute` — hence 1.5e9 here.
 */
export const WEB_SEARCH_SEQ_BASE = 1_500_000_000;

/** Research cap per turn (one Numo response, one agent turn). */
export const MAX_WEB_SEARCHES_PER_TURN = 5;

export interface WebSource {
  url: string;
  title: string | null;
  snippet: string | null;
}

export type WebSearchOutcome =
  | {
      ok: true;
      answer: string;
      sources: WebSource[];
      usage: NormalizedUsage;
      model: string | null;
      generationId: string | null;
    }
  | { ok: false; error: string };

const SEARCH_SYSTEM_PROMPT = `You are a web research assistant. Search results for the user's query are provided to you.
Answer the query strictly from those results — never from memory, never with a guess.
Be factual, dense and short (a few sentences, or a compact list). Give exact figures, versions and dates when the sources carry them.
Name the source domain inline for any claim that matters.
If the results do not answer the query, say so plainly instead of filling the gap.`;

function cap(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** Web search settings (app_config cache of 60 s). */
export async function getWebSearchSettings(): Promise<{ model: string }> {
  const cfg = await getAppConfigValues(modelConfigKeys(WEB_SEARCH_MODEL_CONFIG_KEY));
  return { model: resolveFromValues(WEB_SEARCH_MODEL_CONFIG_KEY, cfg).model };
}

/**
 * Removes `web_search` from a toolset. A tool cut on the admin side must not
 * be offered to the model: it would waste a round to be refused.
 * Generic on the form of the two registers (assistant and agent).
 */
export function withoutWebSearch<T extends { function: { name: string } }>(
  tools: T[]
): T[] {
  return tools.filter((t) => t.function.name !== "web_search");
}

interface CompletionResponse {
  id?: string;
  model?: string;
  usage?: OpenRouterUsage;
  choices?: Array<{
    message?: {
      content?: string | null;
      annotations?: Array<{
        type?: string;
        url_citation?: { url?: string; title?: string; content?: string };
      }>;
    };
  }>;
  error?: { message?: string };
}

/**
 * A web search. Non-streamed OpenRouter subcall: plugin `web` searches,
 * injects extracts, small model responds. The sources come out of the answer.
 * `annotations` (`url_citation`) .
 */
export async function runWebSearch(params: {
  query: string;
  /** OpenRouter key (platform, or user's OpenRouter BYOK). */
  apiKey: string;
  /** Owner of a per-account Minddy Cloud key (MIN-761). */
  managedKeyOwner?: string;
  model: string;
  maxResults?: number;
  signal?: AbortSignal;
}): Promise<WebSearchOutcome> {
  const base = stripModelSuffix(params.model);
  const first = await attemptWebSearch(params);
  // Fallback of the routing shortcut (MIN-263): we only replay on a REFUSAL —
  // a replayed timeout would put Numo's response at 90 s for nothing.
  if (first.outcome.ok || !first.refused || base === params.model) return first.outcome;
  console.warn(`[web-search] ${params.model} refused, retrying on ${base}`);
  return (await attemptWebSearch({ ...params, model: base })).outcome;
}

/** A try, and if it's a failure, whether it's worth replaying without a suffix. */
async function attemptWebSearch(params: {
  query: string;
  apiKey: string;
  /** Owner of a per-account Minddy Cloud key (MIN-761). */
  managedKeyOwner?: string;
  model: string;
  maxResults?: number;
  signal?: AbortSignal;
}): Promise<{ outcome: WebSearchOutcome; refused: boolean }> {
  const query = params.query.trim().slice(0, MAX_QUERY_CHARS);
  if (!query) return { outcome: { ok: false, error: "query is required" }, refused: false };

  const maxResults = Math.min(
    Math.max(Math.trunc(params.maxResults ?? DEFAULT_MAX_RESULTS), 1),
    MAX_RESULTS_CAP
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (params.signal) {
    if (params.signal.aborted) controller.abort();
    else params.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    // The mobile app's AI consent (MIN-907): this call skips fetchAiProvider.
    await assertAiConsent();
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        ...aiChatProviderHeaders("openrouter", "Numo web search (minddy)"),
      },
      signal: controller.signal,
      body: JSON.stringify(
        translateAiChatRequest(
          {
            model: params.model,
            messages: [
              { role: "system", content: SEARCH_SYSTEM_PROMPT },
              { role: "user", content: query },
            ],
            maxOutputTokens: MAX_ANSWER_TOKENS,
            // Summarizing search results needs no reflection (MIN-1001). Not
            // `off`: this request has no replay for a model that must reason,
            // and `minimal` is accepted by every family that reasons.
            reasoning: { effort: "minimal" },
            extensions: {
              plugins: [{ id: "web", engine: "exa", max_results: maxResults }],
            },
          },
          "openrouter",
        ),
      ),
    });

    if (!response.ok) {
      reportProviderError(await providerErrorFromResponse("openrouter", params.model, response), "web_search");
      const detail = await response.text().catch(() => "");
      // A refused managed key is discarded (401). At its cap, the tool returns
      // an error: the turn's next generation ends on the budget message.
      const keyRefused = await handleManagedKeyRejection(
        { apiKey: params.apiKey, managedKeyOwner: params.managedKeyOwner },
        response.status,
        detail,
      ).then(() => response.status === 401, () => true);
      return {
        outcome: {
          ok: false,
          error: `web search failed (${response.status}): ${detail.slice(0, 200)}`,
        },
        // The key, not the model, was refused: no replay without the suffix.
        refused: !keyRefused,
      };
    }

    const body = (await response.json()) as CompletionResponse;
    if (body.error?.message) {
      return {
        outcome: { ok: false, error: `web search failed: ${body.error.message.slice(0, 200)}` },
        refused: true,
      };
    }

    const message = body.choices?.[0]?.message;
    const sources: WebSource[] = [];
    for (const annotation of message?.annotations ?? []) {
      const citation = annotation.url_citation;
      if (!citation?.url) continue;
      if (sources.some((s) => s.url === citation.url)) continue;
      sources.push({
        url: citation.url,
        title: citation.title?.trim() || null,
        snippet: citation.content ? cap(citation.content.trim(), MAX_SNIPPET_CHARS) : null,
      });
      if (sources.length >= maxResults) break;
    }

    return {
      outcome: {
        ok: true,
        answer: (message?.content ?? "").trim(),
        sources,
        usage: parseOpenRouterUsage(body.usage),
        model: body.model ?? params.model,
        generationId: body.id ?? null,
      },
      refused: false,
    };
  } catch (err) {
    const aborted = (err as Error).name === "AbortError";
    return {
      outcome: {
        ok: false,
        error: aborted ? "web search timed out" : `web search failed: ${(err as Error).message}`,
      },
      refused: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Personal-key providers whose API runs a web search of its own. */
const NATIVE_WEB_SEARCH_PROVIDERS = new Set<AgentProviderId>(["anthropic", "openai"]);

export function hasNativeWebSearch(provider: AgentProviderId): boolean {
  return NATIVE_WEB_SEARCH_PROVIDERS.has(provider);
}

/** One search per call, as on the OpenRouter path: the calling model searches again if it needs to. */
const NATIVE_MAX_SEARCHES = 1;

/**
 * Summarizing results needs no reflection (MIN-1001). Claude turns thinking
 * off, or runs at `low` effort where it must think (`lib/ai-chat.ts` picks per
 * model). OpenAI asks for `low`, the cheapest effort its web search tool
 * accepts (`minimal` is refused), dropped for a model that does not reason.
 */
function nativeSearchChatBody(runtime: ResolvedAiRuntime, query: string): Record<string, unknown> {
  return translateAiChatRequest(
    {
      model: runtime.model,
      messages: [
        { role: "system", content: SEARCH_SYSTEM_PROMPT },
        { role: "user", content: query },
      ],
      maxOutputTokens: MAX_ANSWER_TOKENS,
      reasoning: runtime.provider === "anthropic" ? { enabled: false } : { effort: "low" },
    },
    runtime.provider,
  );
}

/** A Responses body asks for encrypted reasoning only from a model that reasons. */
function nativeResponsesBody(chat: Record<string, unknown>): Record<string, unknown> {
  const { include, ...body } = toResponsesBody(chat);
  return {
    ...body,
    ...(body.reasoning ? { include } : {}),
    tools: [{ type: "web_search" }],
  };
}

/** Adds a source once, until `max` are kept. */
function addSource(sources: WebSource[], max: number, url: unknown, title: unknown, snippet: unknown): void {
  if (typeof url !== "string" || !url || sources.length >= max) return;
  if (sources.some((source) => source.url === url)) return;
  sources.push({
    url,
    title: typeof title === "string" && title.trim() ? title.trim() : null,
    snippet: typeof snippet === "string" && snippet.trim() ? cap(snippet.trim(), MAX_SNIPPET_CHARS) : null,
  });
}

interface AnthropicSearchBlock {
  type?: string;
  text?: string;
  citations?: Array<{ url?: string; title?: string | null; cited_text?: string }> | null;
  content?: unknown;
}

/**
 * The Messages API reply of a search → answer and sources. Cited passages
 * come first; the remaining results fill the list without a snippet, since
 * Anthropic returns their page content encrypted.
 */
export function parseAnthropicWebSearch(
  body: { content?: AnthropicSearchBlock[] },
  maxResults: number,
): { answer: string; sources: WebSource[]; error: string | null } {
  const blocks = Array.isArray(body.content) ? body.content : [];
  const sources: WebSource[] = [];
  let answer = "";
  let error: string | null = null;
  for (const block of blocks) {
    if (block.type !== "text") continue;
    answer += block.text ?? "";
    for (const citation of block.citations ?? []) {
      addSource(sources, maxResults, citation.url, citation.title, citation.cited_text);
    }
  }
  for (const block of blocks) {
    if (block.type !== "web_search_tool_result") continue;
    if (Array.isArray(block.content)) {
      for (const result of block.content as Array<{ url?: string; title?: string }>) {
        addSource(sources, maxResults, result.url, result.title, null);
      }
    } else if (block.content && typeof block.content === "object") {
      const code = (block.content as { error_code?: unknown }).error_code;
      error = `web search failed: ${typeof code === "string" ? code : "unavailable"}`;
    }
  }
  return { answer: answer.trim(), sources, error };
}

interface ResponsesSearchItem {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
    annotations?: Array<{ type?: string; url?: string; title?: string }>;
  }>;
  action?: { sources?: Array<{ url?: string }> };
}

/**
 * The Responses API reply of a search → answer and sources: the message's
 * `url_citation` annotations, then the pages the search call read.
 */
export function parseOpenAiWebSearch(
  body: { output?: ResponsesSearchItem[] },
  maxResults: number,
): { answer: string; sources: WebSource[] } {
  const items = Array.isArray(body.output) ? body.output : [];
  const sources: WebSource[] = [];
  let answer = "";
  for (const item of items) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text") continue;
      answer += part.text ?? "";
      for (const annotation of part.annotations ?? []) {
        if (annotation.type === "url_citation") addSource(sources, maxResults, annotation.url, annotation.title, null);
      }
    }
  }
  for (const item of items) {
    if (item.type !== "web_search_call") continue;
    for (const source of item.action?.sources ?? []) addSource(sources, maxResults, source.url, null, null);
  }
  return { answer: answer.trim(), sources };
}

/**
 * A web search on the account's own Anthropic or OpenAI key (MIN-1021): the
 * provider's web search tool, on the model the account runs. The provider
 * bills the account; minddy's ledger keeps no line for a personal key.
 */
export async function runNativeWebSearch(params: {
  query: string;
  runtime: ResolvedAiRuntime;
  maxResults?: number;
  signal?: AbortSignal;
}): Promise<WebSearchOutcome> {
  const { runtime } = params;
  const query = params.query.trim().slice(0, MAX_QUERY_CHARS);
  if (!query) return { ok: false, error: "query is required" };
  if (!hasNativeWebSearch(runtime.provider)) {
    return { ok: false, error: "Web search is not available here." };
  }
  const maxResults = Math.min(
    Math.max(Math.trunc(params.maxResults ?? DEFAULT_MAX_RESULTS), 1),
    MAX_RESULTS_CAP
  );
  const signal = params.signal
    ? AbortSignal.any([params.signal, AbortSignal.timeout(TIMEOUT_MS)])
    : AbortSignal.timeout(TIMEOUT_MS);
  const chat = nativeSearchChatBody(runtime, query);
  const anthropic = runtime.provider === "anthropic";
  const url = `${normalizeBaseUrl(runtime.baseUrl)}/${anthropic ? "messages" : "responses"}`;
  const body = anthropic
    ? {
        ...toAnthropicMessagesBody(chat),
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: NATIVE_MAX_SEARCHES }],
      }
    : nativeResponsesBody(chat);
  const headers: Record<string, string> = anthropic
    ? { "x-api-key": runtime.apiKey, "anthropic-version": ANTHROPIC_API_VERSION, "content-type": "application/json" }
    : { Authorization: `Bearer ${runtime.apiKey}`, "Content-Type": "application/json" };

  try {
    const response = await fetchAiProvider(runtime.provider, url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const failure = await providerErrorFromResponse(runtime.provider, runtime.model, response.clone());
      reportProviderError(failure, "web_search");
      const detail = await response.text().catch(() => "");
      return { ok: false, error: `web search failed (${response.status}): ${detail.slice(0, 200)}` };
    }
    const reply = (await response.json()) as {
      id?: string;
      model?: string;
      content?: AnthropicSearchBlock[];
      output?: ResponsesSearchItem[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const parsed = anthropic
      ? parseAnthropicWebSearch(reply, maxResults)
      : { ...parseOpenAiWebSearch(reply, maxResults), error: null };
    if (!parsed.answer && parsed.error) return { ok: false, error: parsed.error };
    const promptTokens = reply.usage?.input_tokens ?? null;
    const completionTokens = reply.usage?.output_tokens ?? null;
    return {
      ok: true,
      answer: parsed.answer,
      sources: parsed.sources,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null,
        cost: null,
        cachedTokens: null,
        cacheWriteTokens: null,
      },
      model: reply.model ?? runtime.model,
      generationId: reply.id ?? null,
    };
  } catch (err) {
    const aborted = (err as Error).name === "AbortError" || (err as Error).name === "TimeoutError";
    return {
      ok: false,
      error: aborted ? "web search timed out" : `web search failed: ${(err as Error).message}`,
    };
  }
}

/**
 * The search as called by the tools (Numo chat, @Numo in comment,
 * code agents): admin settings, call, writing of the line `web_search` to
 * ledger, result ready to send back to the model. Same return form as the others
 * tools of the two loops (`{ result, success }`).
 *
 * The imputation comes from the caller (`billTo`): the search is a subcall of the
 * round, it is billed to whoever is billed for the round. The recorded cost includes the
 * research package.
 */
export async function runWebSearchTool(params: {
  query: string;
  /** Historical fallback/tests. With a user, the key and model resolve by surface. */
  apiKey?: string;
  userId?: string;
  surface?: AiSurface;
  runId: string;
  seq: number;
  maxResults?: number;
  billTo: AiUsageBillTo;
  projectId?: string | null;
  conversationId?: string | null;
  numoTurnId?: string | null;
  routineId?: string | null;
  signal?: AbortSignal;
}): Promise<{ result: unknown; success: boolean }> {
  const settings = await getWebSearchSettings();

  const runtime = params.userId
    ? await resolveAiRuntime({
        userId: params.userId,
        modelKey: WEB_SEARCH_MODEL_CONFIG_KEY,
        surface: params.surface ?? "assistant",
      }).catch(() => null)
    : null;

  // An Anthropic or OpenAI key searches with its provider's own tool, on the
  // account's model (MIN-1021). Its failure is the search's answer: replaying
  // it on minddy Cloud would spend what the account chose not to.
  if (runtime?.mode === "byok" && hasNativeWebSearch(runtime.provider)) {
    const native = await runNativeWebSearch({
      query: params.query,
      runtime,
      maxResults: params.maxResults,
      signal: params.signal,
    });
    if (!native.ok) return { result: { error: native.error }, success: false };
    return {
      result: {
        query: params.query.trim().slice(0, MAX_QUERY_CHARS),
        answer: native.answer,
        sources: native.sources,
      },
      success: true,
    };
  }

  // The `web` plugin is an OpenRouter capability, not part of the
  // OpenAI-compatible standard: an OpenRouter key runs it with the account's
  // model, and a personal provider without a search of its own stays on
  // minddy Cloud for this subcall.
  const byokOpenRouter = runtime?.provider === "openrouter" ? runtime : null;
  const managedKey = byokOpenRouter ?? (params.apiKey
    ? { apiKey: params.apiKey }
    : await resolvePlatformApiKey(params.userId ?? null).catch(() => null));
  const apiKey = managedKey?.apiKey;
  if (!apiKey) {
    return { result: { error: "Web search is not available here." }, success: false };
  }

  const outcome = await runWebSearch({
    query: params.query,
    apiKey,
    managedKeyOwner: managedKey?.managedKeyOwner,
    model: byokOpenRouter?.model ?? settings.model,
    maxResults: params.maxResults,
    signal: params.signal,
  });

  if (!outcome.ok) return { result: { error: outcome.error }, success: false };

  await recordAiUsage({
    runId: params.runId,
    seq: params.seq,
    feature: "web_search",
    provider: "openrouter",
    keyMode: byokOpenRouter?.mode ?? "platform",
    model: outcome.model,
    generationId: outcome.generationId,
    promptTokens: outcome.usage.promptTokens,
    completionTokens: outcome.usage.completionTokens,
    totalTokens: outcome.usage.totalTokens,
    cost: outcome.usage.cost,
    cachedTokens: outcome.usage.cachedTokens,
    cacheWriteTokens: outcome.usage.cacheWriteTokens,
    billTo: params.billTo,
    projectId: params.projectId ?? null,
    conversationId: params.conversationId ?? null,
    numoTurnId: params.numoTurnId ?? null,
    routineId: params.routineId ?? null,
  });

  return {
    result: {
      query: params.query.trim().slice(0, MAX_QUERY_CHARS),
      answer: outcome.answer,
      sources: outcome.sources,
    },
    success: true,
  };
}
