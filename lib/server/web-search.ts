import "server-only";

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
import { resolveAiRuntime } from "@/lib/server/ai-runtime";
import { isManagedAiEnabled } from "@/lib/managed-services";
import {
  aiChatProviderHeaders,
  translateAiChatRequest,
} from "@/lib/ai-chat";

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
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** `app_config` keys (adjustable from /admin, see lib/ai-model-config.ts). */
export const WEB_SEARCH_MODEL_CONFIG_KEY = "web_search_model";
export const WEB_SEARCH_ENABLED_CONFIG_KEY = "web_search_enabled";

/** Exa plan per search, as billed by OpenRouter (USD, indicative). */
export const WEB_SEARCH_USD_PER_CALL = 0.005;

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
export async function getWebSearchSettings(): Promise<{
  enabled: boolean;
  model: string;
}> {
  const cfg = await getAppConfigValues([
    WEB_SEARCH_ENABLED_CONFIG_KEY,
    ...modelConfigKeys(WEB_SEARCH_MODEL_CONFIG_KEY),
  ]);
  return {
    // Absent = enabled (mirror of admin registry fallback).
    enabled: cfg[WEB_SEARCH_ENABLED_CONFIG_KEY]?.trim() !== "false",
    model: resolveFromValues(WEB_SEARCH_MODEL_CONFIG_KEY, cfg).model,
  };
}

/** The admin flag alone — to decide whether to OFFER the tool or not. */
export async function isWebSearchEnabled(): Promise<boolean> {
  return (await getWebSearchSettings()).enabled;
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
            extensions: {
              plugins: [{ id: "web", engine: "exa", max_results: maxResults }],
            },
          },
          "openrouter",
        ),
      ),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        outcome: {
          ok: false,
          error: `web search failed (${response.status}): ${detail.slice(0, 200)}`,
        },
        refused: true,
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
  signal?: AbortSignal;
}): Promise<{ result: unknown; success: boolean }> {
  const settings = await getWebSearchSettings();
  if (!settings.enabled) {
    return {
      result: { error: "Web search is disabled on this instance." },
      success: false,
    };
  }

  const runtime = params.userId
    ? await resolveAiRuntime({
        userId: params.userId,
        modelKey: WEB_SEARCH_MODEL_CONFIG_KEY,
        surface: params.surface ?? "assistant",
      }).catch(() => null)
    : null;

  // The `web` plugin is an OpenRouter capability, not an extension of the standard
  // OpenAI-compatible. A native key therefore remains on the Minddy quota for CE
  // subcall; an OpenRouter key uses its model per feature.
  const byokOpenRouter = runtime?.provider === "openrouter" ? runtime : null;
  const apiKey =
    byokOpenRouter?.apiKey ??
    params.apiKey ??
    (isManagedAiEnabled() ? process.env.OPENROUTER_API_KEY : undefined);
  if (!apiKey) {
    return { result: { error: "Web search is not available here." }, success: false };
  }

  const outcome = await runWebSearch({
    query: params.query,
    apiKey,
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
    billTo: params.billTo,
    projectId: params.projectId ?? null,
    conversationId: params.conversationId ?? null,
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
