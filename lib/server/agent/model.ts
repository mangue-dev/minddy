import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValue } from "@/lib/server/app-config";
import { assertPublicHttpUrl } from "@/lib/server/safe-fetch";
import { AGENT_MODEL_CONFIG_KEY, AGENT_ROOT_MODEL_FALLBACK } from "@/lib/agent-models";
import {
  DEFAULT_AGENT_PROVIDER,
  isLocalAgentProvider,
  resolveProviderBaseUrl,
  type AgentProviderId,
} from "@/lib/agent-providers";
import {
  isReasoningLevel,
  DEFAULT_REASONING_LEVEL,
  type ReasoningLevel,
} from "@/lib/agent-reasoning";
import {
  decryptUserAiKey,
  LOCAL_ENDPOINT_WITHOUT_API_KEY,
} from "./byok-credentials";
import { getOpenRouterModelInfo } from "./openrouter-index";
import type { VmModelPricing } from "./vm/protocol";
import {
  DEFAULT_BYOK_SURFACES,
  type AiSurface,
  type ByokFeatureModels,
} from "@/lib/ai-surfaces";
import { isManagedAiEnabled } from "@/lib/managed-services";

/**
 * Resolved code agent model and endpoint (MIN-46).
 *
 * MODEL — the account preference is the sole source for every new code
 * worker. Launch callers, conversations, routines, automations and PR reviews
 * cannot override it. The active provider is frozen separately on the run; if
 * the saved model belongs to another provider, the user must deliberately
 * choose a compatible model in Account settings.
 *
 * ENDPOINT — only one active BYOK per account: provider + base URL + user key
 * if present (unlimited use, at own expense), otherwise the OpenRouter platform key
 * OPENROUTER_API_KEY (capped monthly, see quota.ts).
 */

/** Root default (admin): app_config.agent_model or the fallback code. */
export async function getRootDefaultModel(): Promise<string> {
  return (await getAppConfigValue(AGENT_MODEL_CONFIG_KEY))?.trim() || AGENT_ROOT_MODEL_FALLBACK;
}

interface StoredAgentModelPreference {
  model: string | null;
  provider: string | null;
}

/** User's personal code-worker model and the provider it was selected for. */
export async function getUserDefaultModel(
  userId: string,
): Promise<StoredAgentModelPreference> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("user_agent_preferences")
    .select("default_model, default_model_provider")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as {
    default_model: string | null;
    default_model_provider: string | null;
  } | null;
  return {
    model: row?.default_model?.trim() || null,
    provider: row?.default_model_provider ?? null,
  };
}

/** User's reasoning fault, or null if they have not defined one. */
export async function getUserDefaultReasoningLevel(
  userId: string,
): Promise<ReasoningLevel | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("user_agent_preferences")
    .select("default_reasoning_level")
    .eq("user_id", userId)
    .maybeSingle();
  const raw = (data as { default_reasoning_level: string | null } | null)?.default_reasoning_level;
  return isReasoningLevel(raw) ? raw : null;
}

/**
 * Resolve the account reasoning level to freeze on a new run (MIN-122).
 * Launch callers cannot override it.
 *
 * The four levels are open to ALL, minddy quota included: the subscription is
 * paid, it must be fully usable. What limits the expense is the budget
 * itself (`checkAgentQuota` at launch, and stopping mid-run when it
 * is exhausted), not a restriction on the level.
 */
export async function resolveReasoningLevel(userId: string): Promise<ReasoningLevel> {
  return (await getUserDefaultReasoningLevel(userId)) ?? DEFAULT_REASONING_LEVEL;
}

/** Raised when the account has no model valid for its active worker provider. */
export class AgentModelRequiredError extends Error {
  code = "noModelForProvider" as const;
  constructor(public provider: string) {
    super(`No account code-worker model is configured for provider ${provider}`);
    this.name = "AgentModelRequiredError";
  }
}

/** Model frozen on a run. */
export interface ResolvedAgentModel {
  model: string;
  chosenByUser: true;
}

/**
 * Resolves the sole model that may be frozen on a new code-worker run.
 *
 * A preference is provider-bound. Changing, disabling or losing a BYOK key
 * therefore makes the old choice unavailable until the user selects a model
 * from Account settings. We never replace it with a cheaper platform or
 * provider default.
 */
export async function resolveAgentModel(userId: string): Promise<ResolvedAgentModel> {
  const [preference, byok] = await Promise.all([
    getUserDefaultModel(userId),
    getUserByok(userId, "agent"),
  ]);
  const provider = byok?.provider ?? DEFAULT_AGENT_PROVIDER;
  if (!preference.model || preference.provider !== provider) {
    throw new AgentModelRequiredError(provider);
  }
  return { model: preference.model, chosenByUser: true };
}

// ── Endpoint (provider + base URL + key) ─────────────────────────────────────

export interface UserByok {
  provider: AgentProviderId;
  apiKey: string;
  /** Effective URL base (register, or custom for 'generic'). */
  baseUrl: string;
  enabledSurfaces: AiSurface[];
  featureModels: ByokFeatureModels;
}

/** A private endpoint is never a valid fallback for a cloud microVM. */
export class LocalEndpointRequiresLocalRunError extends Error {
  code = "localEndpointRequiresLocalRun" as const;
  constructor() {
    super("This BYOK endpoint is local and can only be used by a local run");
    this.name = "LocalEndpointRequiresLocalRunError";
  }
}

/** A frozen BYOK run never changes payer if its key is removed. */
export class ByokCredentialUnavailableError extends Error {
  code = "byokCredentialUnavailable" as const;
  constructor() {
    super("The BYOK credential used by this run is no longer available");
    this.name = "ByokCredentialUnavailableError";
  }
}

/**
 * Is an unvalidated key recognized NOW? (MIN-344)
 *
 * The normal path sets `validated_at` to registration. There remain two cases where
 * the column is null: lines before MIN-344, and those recorded
 * during a supplier outage (`unknown` verdict). Rather than condemning them, we try again here — on first use — and set the date if the key
 * responds. A key that does not respond remains inert: the account falls back to the key
 * platform and its ceiling, which is exactly the desired behavior.
 *
 * The NEGATIVE result is stored for a few minutes: without that, an account with a dead key
 * would pay a network round trip for each endpoint reading — and it y en
 * has several per run.
 */
const UNVALIDATED_TTL_MS = 5 * 60 * 1000;
const unvalidatedProbes = new Map<string, number>();

/** Test purge — process cache, not shared state. */
export function resetByokProbeCache(): void {
  unvalidatedProbes.clear();
}

async function confirmsUnvalidatedKey(params: {
  userId: string;
  provider: AgentProviderId;
  apiKey: string;
  baseUrl: string;
}): Promise<boolean> {
  const lastFailure = unvalidatedProbes.get(params.userId);
  if (lastFailure && Date.now() - lastFailure < UNVALIDATED_TTL_MS) return false;

  const { probeByokKey } = await import("./byok-validate");
  const verdict = await probeByokKey({ ...params, rateLimitKey: params.userId });
  if (verdict !== "valid") {
    unvalidatedProbes.set(params.userId, Date.now());
    return false;
  }
  unvalidatedProbes.delete(params.userId);
  await getServiceClient()
    .from("user_ai_keys")
    .update({ validated_at: new Date().toISOString() })
    .eq("user_id", params.userId)
    .eq("provider", params.provider);
  return true;
}

/**
 * Active BYOK of the user (only one), decrypted and resolved at endpoint, or
 * null. Ignores a line whose URL base is not resolvable (generic without URL)
 * or whose key no longer decrypts (secret turned → “reconfigure your key”).
 *
 * Also ignores — since MIN-344 — a key that the provider has never recognized.
 * An invented key raised all the usual ceilings without ever having done
 * run anything; an unvalidated line is therefore no longer worth anything, neither
 * here nor in `checkAgentQuota`.
 */
export async function getUserByok(
  userId: string,
  surface?: AiSurface,
): Promise<UserByok | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("user_ai_keys")
    .select("provider, key_encrypted, base_url, validated_at, enabled_surfaces, feature_models")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as {
    provider: string;
    key_encrypted: string | null;
    base_url: string | null;
    validated_at: string | null;
    enabled_surfaces: AiSurface[] | null;
    feature_models: ByokFeatureModels | null;
  } | null;
  if (!row) return null;
  const enabledSurfaces = Array.isArray(row.enabled_surfaces)
    ? row.enabled_surfaces
    : DEFAULT_BYOK_SURFACES;
  if (surface && !enabledSurfaces.includes(surface)) return null;
  const localProvider = isLocalAgentProvider(row.provider);
  // Only the agent surface has an explicit local-execution handoff. Every
  // other surface runs on the server and must ignore a legacy or corrupted
  // local-provider assignment even if it bypassed the database constraint.
  if (localProvider && surface && surface !== "agent") return null;
  const apiKey =
    row.key_encrypted === LOCAL_ENDPOINT_WITHOUT_API_KEY
      ? ""
      : decryptUserAiKey(row.key_encrypted);
  // The key remains mandatory for all cloud providers. Locally, Ollama
  // and most OpenAI-compatible servers do not require any: the
  // proxy will then remove the placeholder from opencode instead of sending it.
  if (!apiKey && !localProvider) return null;
  const baseUrl = resolveProviderBaseUrl(row.provider, row.base_url);
  if (!baseUrl) return null;
  // A custom cloud URL database is revalidated for EACH use, not just for
  // the registration (MIN-341): between the two, the DNS of the domain belongs
  // always to the one who seized it, and nothing prevents it from now on pointing
  // on the internal network. A URL that has become unresolvable falls into the same situation
  // that the other unusable lines — we ignore it.
  // The server never resolves a local address: only the LLM proxy and the
  // harness from the desktop app access it.
  if (row.base_url && !localProvider) {
    try {
      await assertPublicHttpUrl(baseUrl);
    } catch {
      return null;
    }
  }
  const provider = row.provider as AgentProviderId;
  if (
    !row.validated_at &&
    !localProvider &&
    !(await confirmsUnvalidatedKey({ userId, provider, apiKey: apiKey!, baseUrl }))
  ) {
    return null;
  }
  return {
    provider,
    apiKey: apiKey ?? "",
    baseUrl,
    enabledSurfaces,
    featureModels: row.feature_models ?? {},
  };
}

/** True if the user has a usable BYOK (→ unlimited use). */
export async function userHasByokKey(
  userId: string,
  surface: AiSurface = "agent",
): Promise<boolean> {
  return (await getUserByok(userId, surface)) != null;
}

// ── Capacities per model, read from the OpenRouter index ──────────────────────
// The index itself lives in `openrouter-index.ts`: a single read of
// /models for the picker catalog, these two capacities and the prices (so the
// plan multiplier). The two functions below remain here because
// this is where the agent loop will look for them.

/**
 * Context window (tokens) of a model, to size the threshold of
 * compaction (~75%). Only in OpenRouter provider (index /models which carries
 * `context_length`); null otherwise → the caller falls back to the default threshold.
 * Best-effort, hidden at the process level.
 */
export async function getModelContextWindow(
  model: string,
  provider: AgentProviderId,
  apiKey: string,
): Promise<number | null> {
  if (provider !== "openrouter") return null;
  return (await getOpenRouterModelInfo(model, apiKey))?.contextLength ?? null;
}

/**
 * INPUT price of the model (USD per million tokens), to size the threshold
 * of compaction: what the threshold limits is the cost of returning the history to
 * each round, and this cost only makes sense at the price of the model
 * (`agentCompactThreshold`). Same source and same limits as window —
 * OpenRouter only; `null` out of there, and the caller falls back on the calibrated
 * value rather than extrapolating on an ignorance.
 */
export async function getModelInputPrice(
  model: string,
  provider: AgentProviderId,
  apiKey: string,
): Promise<number | null> {
  if (provider !== "openrouter") return null;
  return (await getOpenRouterModelInfo(model, apiKey))?.pricing?.inputUsdPerMTok ?? null;
}

/**
 * ALL model prices, cache included — what the microVM takes so that
 * the opencode harness calculates a cost that is OURS (MIN-286,
 * cf. `VmModelPricing`). Same source and same limits as the two functions
 * above: the OpenRouter index, therefore `null` in direct BYOK.
 *
 * `null` is not a benign detail here: a model declared without price makes
 * `cost: 0` to opencode. The caller must then write the usage in `estimated`,
 * never a zero in the ledger.
 */
export async function getModelPricing(
  model: string,
  provider: AgentProviderId,
  apiKey: string,
): Promise<VmModelPricing | null> {
  if (provider !== "openrouter") return null;
  const info = await getOpenRouterModelInfo(model, apiKey);
  if (!info?.pricing) return null;
  return {
    inputUsdPerMTok: info.pricing.inputUsdPerMTok,
    outputUsdPerMTok: info.pricing.outputUsdPerMTok,
    ...(info.cachePricing
      ? {
          cacheReadUsdPerMTok: info.cachePricing.readUsdPerMTok,
          cacheWriteUsdPerMTok: info.cachePricing.writeUsdPerMTok,
        }
      : {}),
  };
}

/**
 * Does the run model accept an image as input? Decides whether `read_resource`
 * RETURNS the mock instead of describing its metadata (MIN-111), and whether the
 * prompt announces the capability. Same source as the context window: the index
 * OpenRouter. Excluding OpenRouter (direct BYOK openai/anthropic/google/generic), on
 * does not have a reliable capability index → ​​`false`, i.e. the behavior before
 * MIN-111 to the nearest byte. Sending an image to a model who doesn't want it breaks the
 * turn on 400: the conservative default is the right one.
 */
export async function supportsImageInput(
  model: string,
  provider: AgentProviderId,
  apiKey: string,
): Promise<boolean> {
  if (provider !== "openrouter") return false;
  return (await getOpenRouterModelInfo(model, apiKey))?.imageInput ?? false;
}

export type AgentKeyMode = "platform" | "byok";

export class ManagedAgentServiceUnavailableError extends Error {
  constructor() {
    super("Managed AI is not configured. Configure BYOK or enable MINDDY_MANAGED_AI.");
    this.name = "ManagedAgentServiceUnavailableError";
  }
}

export interface ResolvedAgentEndpoint {
  apiKey: string;
  mode: AgentKeyMode;
  provider: AgentProviderId;
  /** Base URL OpenAI-compatible (sans /chat/completions). */
  baseUrl: string;
}

/**
 * Resolves the effective endpoint: BYOK the user if present (provider + base URL +
 * key), otherwise the OpenRouter platform key. Raised if no platform key.
 */
export async function resolveAgentApiKey(
  userId: string,
  surface: Extract<AiSurface, "agent" | "assistant" | "automations"> = "agent",
  options: { allowLocal?: boolean; requireByok?: boolean } = {},
): Promise<ResolvedAgentEndpoint> {
  const byok = await getUserByok(userId, surface);
  if (byok) {
    if (isLocalAgentProvider(byok.provider) && !options.allowLocal) {
      throw new LocalEndpointRequiresLocalRunError();
    }
    return { apiKey: byok.apiKey, mode: "byok", provider: byok.provider, baseUrl: byok.baseUrl };
  }
  if (options.requireByok) throw new ByokCredentialUnavailableError();
  if (!isManagedAiEnabled()) throw new ManagedAgentServiceUnavailableError();
  const platform = process.env.OPENROUTER_API_KEY;
  if (!platform) throw new ManagedAgentServiceUnavailableError();
  const baseUrl = resolveProviderBaseUrl(DEFAULT_AGENT_PROVIDER);
  return { apiKey: platform, mode: "platform", provider: DEFAULT_AGENT_PROVIDER, baseUrl: baseUrl! };
}
