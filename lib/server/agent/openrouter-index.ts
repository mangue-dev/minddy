import "server-only";

import type { ModelPricing } from "@/lib/model-multiplier";
import { isReasoningLevel, type ModelReasoning, type ReasoningLevel } from "@/lib/agent-reasoning";
import { fetchAiProviderBytes } from "@/lib/server/ai-provider-request";

/**
 * The OpenRouter index: A reading of `/models`, cached at the
 * process, from which come all the questions we ask a model before
 * using it.
 *
 * Three readers, a single round trip :
 * - the picker catalog (`models-catalog.ts`) — display name + filter
 * tool-calling ;
 * - the agent loop (`model.ts`) — context window (threshold of
 * compaction) and image input (MIN-111) ;
 * - the REASONING selector — the tiers that each model accepts,
 * published model by model (`reasoning.supported_efforts`);
 * - the plan cap (`model-plan.ts`) — the prices, therefore the multiplier.
 * Each drew their own request to the same URL before: three caches with different durations
 * of different lives, which could contradict each other on the same model.
 *
 * Best-effort from end to end: a failure leaves the index as is (stale, or
 * empty) and the callers fall back on their conservative default. OpenRouter's public catalog
 * opens without a key — `Bearer` is just a courtesy
 * attribution when you have one.
 */

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const MAX_MODELS_RESPONSE_BYTES = 5 * 1024 * 1024;

/** Same duration as the old catalog cache: the list moves slowly. */
const TTL_MS = 60 * 60 * 1000;

export interface OpenRouterModelInfo {
  id: string;
  /** Display name published by OpenRouter (`name`), otherwise the id. */
  name: string;
  contextLength: number | null;
  /** `architecture.input_modalities` contains `image` → we can SHOW him a model. */
  imageInput: boolean;
  /**
 * `architecture.output_modalities` contains ONLY `text`. A model that renders
 * image, audio, or video has no place in a code agent picker
 * — and `supported_parameters` is not enough to rule it out:
 * `google/gemini-3-pro-image` and `openai/gpt-audio` declare `tools`.
 */
  textOutput: boolean;
  /**
 * This is not a model but a SWITCH: `openrouter/auto` and its cousins
 * (`fusion`, `free`, `pareto-code`…), and the aliases `~éditeur/famille-latest`
 * which redirect to the latest model of a family. OpenRouter publishes them
 * in `/models` with `architecture.tokenizer: "Router"`, and the aliases carry
 * in addition to a `alias_target`. We keep them in the index - an id stuck in the hand
 * must remain encryptable - but the catalog does not offer them: what they
 * execute changes under the user's feet, prices and levels of
 * reasoning understood.
 */
  router: boolean;
  /**
 * `supported_parameters` contains `tools`. A model that declares NO
 * parameter is deemed compatible: the absence of an announcement is not a refusal.
 */
  tools: boolean;
  /** Published prices, converted to the million tokens. `null` if unreadable. */
  pricing: ModelPricing | null;
  /**
 * Price of the prompt CACHE, when OpenRouter publishes them (MIN-286) — `null`
 * otherwise, which is the common case.
 *
 * Outside of the express multiplier: this compares models with each other and
 * doesn't care about the cache. These two prices are used to CHARGE — a round
 * of agent rereads its history, so the majority of its input tokens are
 * cache reads, at a tenth of the full price. Counting them at the entry rate
 * would inflate the bill by an order of magnitude.
 */
  cachePricing: { readUsdPerMTok: number; writeUsdPerMTok: number } | null;
  /**
 * What THIS model accepts as levels of reasoning (MIN-122, refined) —
 * `null` when it does not publish anything, which means two different things
 * that OpenRouter does not distinguish: it does not reason, or it does not say it. The
 * selector falls in both cases on the generic levels, and it is the
 * safe fallback: one level too many is reduced by OpenRouter, a missing level
 * would be a setting that would be hidden for no reason.
 */
  reasoning: ModelReasoning | null;
}

const index = new Map<string, OpenRouterModelInfo>();
let loadedAt = 0;
let inFlight: Promise<void> | null = null;

/**
 * `"0.0000012"` (USD/token) → 1.2 (USD/Mtok). Tolerates an already typed number.
 *
 * Rounding to 6 decimal places is not vanity: `1e-7 * 1e6` does not make
 * exactly 0.1 when floating, and these crumbs propagated into the
 * multiplier displayed. To the nearest millionth of a dollar, we are already well
 * below what the lowest published price distinguishes.
 */
function perMillionTokens(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1_000_000 * 1e6) / 1e6 : null;
}

/**
 * The `reasoning` object of a model, reduced to what the selector knows how to show.
 *
 * `supported_efforts` comes from the heaviest to the lightest and speaks the vocabulary
 * of OpenRouter: we return it (our lists go from the least expensive to the most expensive) and
 * we translate `none` into `off`, ours. Any unknown value is DISCARDED rather than guessed — a level that cannot be named cannot be displayed, and it must not be selected either.
 */
function parseReasoning(raw: {
  mandatory?: boolean;
  supported_efforts?: string[];
} | undefined): ModelReasoning | null {
  if (!raw) return null;
  const efforts = (raw.supported_efforts ?? [])
    .map((e) => (e === "none" ? "off" : e))
    .filter((e): e is ReasoningLevel => isReasoningLevel(e))
    .reverse();
  return { efforts, mandatory: raw.mandatory === true };
}

async function fetchIndex(apiKey?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetchAiProviderBytes("openrouter", MODELS_URL, {
    headers,
    maxBytes: MAX_MODELS_RESPONSE_BYTES,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = JSON.parse(res.bytes.toString("utf8")) as {
    data?: Array<{
      id?: string;
      name?: string;
      context_length?: number;
      architecture?: {
        input_modalities?: string[];
        output_modalities?: string[];
        tokenizer?: string;
      };
      alias_target?: { slug?: string } | null;
      supported_parameters?: string[];
      reasoning?: {
        mandatory?: boolean;
        supported_efforts?: string[];
      };
      pricing?: {
        prompt?: string | number;
        completion?: string | number;
        input_cache_read?: string | number;
        input_cache_write?: string | number;
      };
    }>;
  };
  const next = new Map<string, OpenRouterModelInfo>();
  for (const m of body.data ?? []) {
    if (!m.id) continue;
    const input = perMillionTokens(m.pricing?.prompt);
    const output = perMillionTokens(m.pricing?.completion);
    const cacheRead = perMillionTokens(m.pricing?.input_cache_read);
    const cacheWrite = perMillionTokens(m.pricing?.input_cache_write);
    // A model that declares NO output is deemed textual: the absence
    // announcement should not make it disappear from the picker.
    const outputs = m.architecture?.output_modalities ?? [];
    next.set(m.id, {
      id: m.id,
      name: m.name ?? m.id,
      contextLength: m.context_length && m.context_length > 0 ? m.context_length : null,
      imageInput: (m.architecture?.input_modalities ?? []).includes("image"),
      textOutput: outputs.every((o) => o === "text"),
      router: m.architecture?.tokenizer === "Router" || !!m.alias_target,
      tools: !m.supported_parameters?.length || m.supported_parameters.includes("tools"),
      reasoning: parseReasoning(m.reasoning),
      pricing:
        input != null && output != null
          ? { inputUsdPerMTok: input, outputUsdPerMTok: output }
          : null,
      // Both together or nothing: a reading prize without a writing prize
      // would charge full price for writing, which is worse than letting
      // opencode fall back on the entry price for both.
      cachePricing:
        cacheRead != null && cacheWrite != null
          ? { readUsdPerMTok: cacheRead, writeUsdPerMTok: cacheWrite }
          : null,
    });
  }
  // Atomic replacement: a half-rewritten index would pass a pattern
  // for unknown the time of the loop — therefore for “unknown price”, therefore authorized.
  if (next.size > 0) {
    index.clear();
    for (const [id, info] of next) index.set(id, info);
    loadedAt = Date.now();
  }
}

/**
 * Loads the index if it is missing or out of date. Never raises, and deduplicates, the
 * concurrent calls: at the start of an invocation, the catalog, the loop and
 * the cap request all three in the same millisecond.
 */
export async function loadOpenRouterIndex(apiKey?: string): Promise<void> {
  if (index.size > 0 && Date.now() - loadedAt < TTL_MS) return;
  if (!inFlight) {
    inFlight = fetchIndex(apiKey)
      .catch((err) => {
        console.error("[openrouter-index] load failed:", (err as Error).message);
      })
      .finally(() => {
        inFlight = null;
      });
  }
  await inFlight;
}

/**
 * What the index knows about a model, or `null`.
 *
 * Falling back to the NU id (`anthropic/claude-opus-5:nitro` → `anthropic/claude-opus-5`)
 * is not a display convenience: OpenRouter routing suffixes
 * (`:nitro`, `:floor`, `:online`…) designate the same model at the same price, and without
 * this fallback it would be enough to paste one to make a model "of unknown price",
 * therefore out ceiling. Variants that have a real price of their own (`:free`) are
 * listed as is and win by exact equality, tested first.
 */
export async function getOpenRouterModelInfo(
  model: string,
  apiKey?: string,
): Promise<OpenRouterModelInfo | null> {
  await loadOpenRouterIndex(apiKey);
  const exact = index.get(model);
  if (exact) return exact;
  const colon = model.lastIndexOf(":");
  return colon > 0 ? index.get(model.slice(0, colon)) ?? null : null;
}

/** The entire catalog, in the order OpenRouter publishes it. Blank if illegible. */
export async function listOpenRouterIndex(apiKey?: string): Promise<OpenRouterModelInfo[]> {
  await loadOpenRouterIndex(apiKey);
  return [...index.values()];
}
