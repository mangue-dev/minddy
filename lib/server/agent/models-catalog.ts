import "server-only";

import {
  getRootDefaultModel,
  resolveAgentApiKey,
  resolveProviderDefaultModel,
  userHasByokKey,
} from "./model";
import { getBaselinePricing, getModelPlanLimit, type ModelPlanLimit } from "./model-plan";
import { listOpenRouterIndex } from "./openrouter-index";
import {
  averageUsdPerMTok,
  modelCostMultiplier,
  type ModelPricing,
} from "@/lib/model-multiplier";
import type { ModelReasoning } from "@/lib/agent-reasoning";
import { getAppConfigValue } from "@/lib/server/app-config";
import { aiModelFallback } from "@/lib/ai-model-config";
import { parseRecommendedModels } from "@/lib/recommended-models";
import { dedupeModelVariants } from "@/lib/model-variants";
import {
  getAgentProvider,
  isLocalAgentProvider,
  normalizeBaseUrl,
  resolveProviderBaseUrl,
  DEFAULT_AGENT_PROVIDER,
  type AgentProviderId,
} from "@/lib/agent-providers";
import { isManagedAiEnabled } from "@/lib/managed-services";

/**
 * Code agent template catalog (MIN-46), resolved according to the provider
 * ASSET of an account (its unique BYOK, or the OpenRouter platform key). Source
 * unique shared by the route `/api/agent/models` (UI picker) AND the tool
 * `list_agent_models` of Numo (wizard) — same list, same cache, same default.
 *
 * We only return `{ id, name, multiplier? }` per model (+ the slug provider,
 * the effective default and the plan cap): the picker reformats via
 * `formatModelName`, and Numo only needs the exact id to force a model
 * at launch. Process cache by `provider|baseUrl` (the list is identical
 * for all accounts of the same endpoint); on failure we serve the expired cache,
 * otherwise an empty list (free entry remains authorized downstream).
 *
 * The multiplier is NEVER hidden with the list: it is recalculated at
 * each call from the current baseline (`app_config.agent_model`, that a
 * admin changes whenever he wants). Frozen in the cache, it would have continued for an hour
 * to locate the models on a scale that no longer exists.
 */

export interface AgentModelEntry {
  id: string;
  name: string;
  /**
 * The reasoning levels that this model accepts (MIN-122, refined), such as
 * that it publishes. Absent outside OpenRouter: the other endpoints do not have
 * a capacity index, and the selector then falls back to the generic
 * levels — the same conservative fallback as for the image.
 */
  reasoning?: ModelReasoning | null;
  /**
 * Usage cost relating to the default minddy model (cf.
 * lib/model-multiplier.ts). Absent when it means nothing: provider BYOK
 * (prices unknown to us, and paid by the user anyway), model
 * outside the OpenRouter catalog, or free baseline.
 */
  multiplier?: number;
}

export interface AgentModelsCatalog {
  provider: AgentProviderId;
  /** Default model of the active provider (BYOK border or root default), or null (generic). */
  defaultModel: string | null;
  models: AgentModelEntry[];
  /**
   * Plan multiplier cap, or `null` when none applies (BYOK and the admin
   * catalog). `null` = the picker does not display a multiplier or gray out a model.
 */
  maxMultiplier?: number | null;
  /** Account Plan — to name the limit in the UI (“your Go plan”). */
  planId?: string;
  /**
 * RECOMMENDED ids, in the order desired by the admin, and restricted to those that
 * this catalog really contains. This is what the picker shows when opening,
 * before any keystroke (see lib/recommended-models.ts).
 *
 * Absent in the ADMIN catalog: there we set `app_config`, including
 * transcription or embedding models that we do not advise anyone — a
 * list of advice would hide precisely what we came to look for.
 */
  recommended?: string[];
  /**
 * Non-secret address that only the desktop application uses to discover
 * the local catalog. The server never joins it: `models` remains empty here
 * and the Electron bridge makes the call on loopback.
 */
  localEndpoint?: {
    provider: Extract<AgentProviderId, "local_openai" | "ollama">;
    baseUrl: string;
  };
}

const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; models: AgentModelEntry[] }>();

/** Discard non-conversational models (embeddings, audio, image, etc.). */
const NON_CHAT_RE = /(embed(?:ding)?|whisper|tts|dall-e|moderation|audio|image|imagen|veo|realtime|transcribe|rerank)/i;

/**
 * The list as PROPOSED: without its version duplicates, and row.
 *
 * The deduplication is valid for the four strategies and not only for
 * OpenRouter: `/v1/models` from OpenAI publishes `gpt-4o` alongside of three
 * `gpt-4o-2024-…`, and Anthropic's only publishes dated ids — in which case
 * the rule does not remove anything, for lack of a bare id opposite. This is exactly what we want:
 * it only stores where there is a duplicate.
 */
function sortById(models: AgentModelEntry[]): AgentModelEntry[] {
  return dedupeModelVariants(models).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * OpenRouter: the catalog comes from the shared index (`openrouter-index.ts`),
 * filtered on tool-calling. Only one reading of `/models` is used here, the loop's abilities
 * and the plan cap prices.
 *
 * Two exclusions in addition to tool-calling, and neither reads in
 * `supported_parameters` :
 * - SWITCHES (`openrouter/auto`, `~anthropic/claude-opus-latest`…) — this
 * are not models, and what they execute changes without warning;
 * - anything that renders something other than TEXT (image, audio, video). The filter
 * by id of `NON_CHAT_RE` is not sufficient and has never run here: `gpt-audio`
 * and `gemini-3-pro-image` both declare `tools`.
 * The index keeps them: one id pasted by hand must remain encryptable.
 *
 * VERSION DOUBLES (dated snapshots, pre-releases, price `:batch` — at
 * alone a fifth of the list here) fall a notch further, into
 * `sortById`, with those of other providers: same reason as referrals,
 * and same limit — we put away what we OFFER, not what we accept.
 */
async function listOpenRouter(apiKey?: string): Promise<AgentModelEntry[]> {
  const index = await listOpenRouterIndex(apiKey);
  if (index.length === 0) throw new Error("empty index");
  return sortById(
    index
      .filter((m) => m.tools && m.textOutput && !m.router)
      .map((m) => ({ id: m.id, name: m.name, reasoning: m.reasoning })),
  );
}

/** OpenAI-compatible `/models` endpoint (OpenAI, Google, generic). */
async function listOpenAICompat(baseUrl: string, apiKey: string): Promise<AgentModelEntry[]> {
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data?: Array<{ id: string }> };
  const models = (body.data ?? [])
    .map((m) => m.id?.replace(/^models\//, "")) // Gemini prefix `models/…`
    .filter((id): id is string => !!id && !NON_CHAT_RE.test(id))
    .map((id) => ({ id, name: id }));
  return sortById(models);
}

/** Anthropic : `/v1/models` natif (x-api-key + anthropic-version). */
async function listAnthropic(baseUrl: string, apiKey: string): Promise<AgentModelEntry[]> {
  const res = await fetch(`${baseUrl}/models?limit=1000`, {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data?: Array<{ id: string; display_name?: string }> };
  const models = (body.data ?? [])
    .filter((m) => !!m.id)
    .map((m) => ({ id: m.id, name: m.display_name ?? m.id }));
  return sortById(models);
}

async function loadModels(
  provider: AgentProviderId,
  baseUrl: string,
  apiKey: string,
): Promise<AgentModelEntry[]> {
  const strategy = getAgentProvider(provider)?.listStrategy ?? "openrouter";
  switch (strategy) {
    case "openrouter":
      return listOpenRouter(apiKey);
    case "anthropic":
      return listAnthropic(baseUrl, apiKey);
    case "openai":
      return listOpenAICompat(baseUrl, apiKey);
    case "generic":
      // Arbitrary endpoint: may not expose /models → failure is tolerated.
      return listOpenAICompat(baseUrl, apiKey);
    case "none":
      // Local endpoints are never reached from the cloud. The field of
      // model remains free in the picker: the user enters the id exposed by
      // Ollama, LM Studio, vLLM… on your own machine.
      return [];
  }
}

/**
 * Locates each model on the baseline scale, attaches the ceiling of the plan,
 * and resolves recommended models. Without a plan limit or a calculable
 * baseline, the picker cannot display multipliers or gray out models.
 *
 * Everything that comes out of here is recalculated on each call, never cached with
 * the list: the baseline like the advice are lines `app_config` that a
 * admin changes without deployment.
 */
async function withMultipliers(
  models: AgentModelEntry[],
  limit: ModelPlanLimit | null,
  useOpenRouterPricing = true,
): Promise<Pick<AgentModelsCatalog, "models" | "maxMultiplier" | "planId" | "recommended">> {
  const recommended = await resolveRecommended(models, useOpenRouterPricing);
  if (!limit?.baseline) return { models, maxMultiplier: null, recommended };
  return {
    models: await attachMultipliers(models, limit.baseline),
    maxMultiplier: limit.maxMultiplier,
    planId: limit.planId,
    recommended,
  };
}

/**
 * Locates each model on the baseline scale, WITHOUT capping anything.
 *
 * The two gestures are separated because they do not respond to the same
 * question: the multiplier SAYS a cost, the ceiling REFUSES an expense. The
 * dashboard admin wants the first without the second — it chooses the models that
 * minddy pays for, so the cost scale there is exactly the useful information,
 * even though no plan applies to it.
 */
async function attachMultipliers(
  models: AgentModelEntry[],
  baseline: ModelPricing | null,
): Promise<AgentModelEntry[]> {
  if (!baseline) return models;
  const index = await listOpenRouterIndex();
  const pricing = new Map<string, ModelPricing | null>(index.map((m) => [m.id, m.pricing]));
  return models.map((m) => {
    const multiplier = modelCostMultiplier(pricing.get(m.id), baseline);
    return multiplier == null ? m : { ...m, multiplier };
  });
}

/**
 * The advice, reduced to what THIS catalog really offers, and arranged FROM
 * CHEAPEST TO MOST EXPENSIVE.
 *
 * The order is calculated, not arranged by hand. This is the only one that remains true: OpenRouter's
 * prices move, and an order frozen in `app_config` the day it was written would end up announcing a cost scale that no longer exists. The
 * admin setting is therefore a SET - which models we recommend - not a
 * sequence.
 *
 * The criterion is the average entry/exit price, exactly that of the
 * multiplier displayed (`averageUsdPerMTok`): the list is sorted in
 * the order of the “×N” that we read opposite. Unknown price → at the end of the list, due to lack of
 * knowing where to put it.
 *
 * The intersection with the catalog is not a style precaution: on a
 * provider BYOK, the ids are native (`claude-sonnet-5`, not
 * `anthropic/claude-sonnet-5`) and no advice is right. The list comes out
 * then EMPTY, and the picker reopens on the entire catalog — the correct fallback: better
 * is worth too many models than a list of tips none of which can be launched.
 *
 * Never hidden with the list of models, for the same reason as
 * multipliers: an admin changes this setting whenever he wants, and an hour of
 * cache would make it lie.
 */
async function resolveRecommended(
  models: AgentModelEntry[],
  useOpenRouterPricing: boolean,
): Promise<string[]> {
  const raw = await getAppConfigValue("recommended_models").catch(() => null);
  const ids =
    parseRecommendedModels(raw) ??
    parseRecommendedModels(aiModelFallback("recommended_models")) ??
    [];
  const available = new Set(models.map((m) => m.id));
  const applicable = ids.filter((id) => available.has(id));
  // A BYOK native provider has no reason to join OpenRouter to store
  // its own models. Without a common price grid, the explicit order of the
  // configuration is the only honest order available.
  if (!useOpenRouterPricing) return applicable;
  const index = await listOpenRouterIndex();
  const price = new Map(
    index.map((m) => [m.id, m.pricing ? averageUsdPerMTok(m.pricing) : null] as const),
  );
  // Prix inconnu → `Infinity`, donc en fin de liste. `localeCompare` en second
  // criterion: two models at the same price (families price in stages)
  // would otherwise keep the writing order of the `app_config` line, which is not
  // no longer supposed to mean anything.
  const cost = (id: string) => price.get(id) ?? Infinity;
  return applicable
    .sort((a, b) => cost(a) - cost(b) || a.localeCompare(b));
}

/**
 * Model catalog of the user's ACTIVE provider (BYOK or key
 * OpenRouter platform). Without BYOK or a managed service, the catalog remains empty:
 * even OpenRouter's public index is a third-party call that the instance did not
 * request. Never raises: on upstream failure, returns the expired cache if it
 * exists, otherwise an empty list.
 *
 * The multipliers and the cap only apply in platform mode. BYOK users pay for
 * their own tokens, so the picker does not restrict their model choices.
 */
export async function getAgentModelsForUser(userId: string): Promise<AgentModelsCatalog> {
  // Active Provider: BYOK of the account, or OpenRouter platform key.
  let provider: AgentProviderId = DEFAULT_AGENT_PROVIDER;
  let baseUrl = resolveProviderBaseUrl(DEFAULT_AGENT_PROVIDER)!;
  let apiKey = "";
  let mode: "platform" | "byok" = "platform";
  let endpointConfigured = true;
  try {
    // Cette lecture ne sonde jamais un endpoint local (`listStrategy: none`) ;
    // it only serves to return the correct provider and to keep the picker in the
    // same namespace as the local run.
    const endpoint = await resolveAgentApiKey(userId, "agent", { allowLocal: true });
    provider = endpoint.provider;
    baseUrl = normalizeBaseUrl(endpoint.baseUrl);
    apiKey = endpoint.apiKey;
    mode = endpoint.mode;
  } catch {
    endpointConfigured = false;
  }

  // Actual fault of the active provider: BYOK provider border, otherwise fault
  // root (quota minddy / OpenRouter BYOK); null for a generic.
  const providerDefault = await resolveProviderDefaultModel(provider);
  const defaultModel =
    providerDefault ?? (provider === "generic" || isLocalAgentProvider(provider) ? null : await getRootDefaultModel());

  const limit = mode === "platform" ? await getModelPlanLimit(userId) : null;
  const localEndpoint = isLocalAgentProvider(provider)
    ? {
        provider: provider as Extract<AgentProviderId, "local_openai" | "ollama">,
        baseUrl,
      }
    : undefined;
  const header = {
    provider,
    defaultModel,
    ...(localEndpoint ? { localEndpoint } : {}),
  };

  if (!endpointConfigured) {
    return { ...header, models: [], recommended: [], maxMultiplier: null };
  }

  const cacheKey = `${provider}|${baseUrl}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return {
      ...header,
      ...(await withMultipliers(hit.models, limit, provider === "openrouter")),
    };
  }
  try {
    const models = await loadModels(provider, baseUrl, apiKey);
    cache.set(cacheKey, { at: Date.now(), models });
    return {
      ...header,
      ...(await withMultipliers(models, limit, provider === "openrouter")),
    };
  } catch {
    return {
      ...header,
      ...(await withMultipliers(hit?.models ?? [], limit, provider === "openrouter")),
    };
  }
}

/**
 * Catalog of the PR review: the platform-compatible catalog with the plan
 * ceiling when the run uses minddy's quota. BYOK removes that ceiling, just as
 * it does for the code-agent picker.
 */
export async function getPrReviewModelCatalog(userId: string): Promise<AgentModelsCatalog> {
  const [models, hasByok] = await Promise.all([
    getPlatformModelCatalog(),
    userHasByokKey(userId),
  ]);
  const limit = hasByok ? null : await getModelPlanLimit(userId);
  return {
    provider: DEFAULT_AGENT_PROVIDER,
    defaultModel: null,
    ...(await withMultipliers(models, limit)),
  };
}

/**
 * Catalog of the PLATFORM key (OpenRouter), for the admin dashboard.
 *
 * Difference assumed with `getAgentModelsForUser`: we ignore the BYOK of the admin
 * who is watching. The `app_config` models all run on the platform key —
 * proposing the Anthropic catalog of an admin in BYOK would cause ids
 * to be written unusable in runtime.
 *
 * The tool-calling filter is PRESERVED: almost all settings admin
 * (Number, assignment, classification, analysis) force a tool call and would break
 * on a model that does not do so. There remain two non-conversational settings —
 * transcription and embeddings — which the OpenRouter catalog does NOT expose in any way
 * (its `/models` only lists chat models): they are adjusted by
 * the free entry of the picker, and this is the only way possible.
 *
 * Same robustness contract as the user catalog: never raises.
 */
/**
 * The catalog of the admin dashboard: that of the platform key, each model
 * LOCATED on the minddy cost scale.
 *
 * The multiplier is the working information: this is where we choose the
 * models that minddy pays for, and in particular the selection recommended, whose order
 * follows these prices. However, no ceiling is attached (`maxMultiplier: null`) —
 * a billing plan does not apply to an instance setting, and graying out
 * expensive models on an admin screen would not make sense. No
 * `recommended` either: we come to settle `app_config`, not follow advice.
 */
export async function getAdminModelCatalog(): Promise<AgentModelsCatalog> {
  const [models, baseline] = await Promise.all([getPlatformModelCatalog(), getBaselinePricing()]);
  return {
    provider: DEFAULT_AGENT_PROVIDER,
    defaultModel: null,
    models: await attachMultipliers(models, baseline),
    maxMultiplier: null,
  };
}

export async function getPlatformModelCatalog(): Promise<AgentModelEntry[]> {
  if (!isManagedAiEnabled()) return [];
  const baseUrl = normalizeBaseUrl(resolveProviderBaseUrl(DEFAULT_AGENT_PROVIDER)!);
  const apiKey = process.env.OPENROUTER_API_KEY;

  const cacheKey = `platform|${baseUrl}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.models;

  try {
    const models = await listOpenRouter(apiKey);
    cache.set(cacheKey, { at: Date.now(), models });
    return models;
  } catch {
    return hit?.models ?? [];
  }
}
