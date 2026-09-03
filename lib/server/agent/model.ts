import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValue } from "@/lib/server/app-config";
import { assertPublicHttpUrl } from "@/lib/server/safe-fetch";
import { AGENT_MODEL_CONFIG_KEY, AGENT_ROOT_MODEL_FALLBACK } from "@/lib/agent-models";
import { aiModelFallback, byokDefaultModelKey } from "@/lib/ai-model-config";
import {
  DEFAULT_AGENT_PROVIDER,
  getProviderDefaultModel,
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
  byokFeatureDefaultModelKey,
  DEFAULT_BYOK_SURFACES,
  type AiSurface,
  type ByokFeatureModels,
} from "@/lib/ai-surfaces";
import { isManagedAiEnabled } from "@/lib/managed-services";

/**
 * Resolved code agent model and endpoint (MIN-46).
 *
 * MODEL — 3-level cascade, precedence run > user > root:
 * 1. run override (chosen at launch, or forced by numo),
 * 2. user's personal default (user_agent_preferences.default_model),
 * 3. BYOK provider border default (openai/anthropic/google) —
 * app_config.byok_default_model_<provider> / provider register,
 * 4. OpenRouter root default (app_config.agent_model / fallback code) —
 * used by the minddy quota AND by OpenRouter BYOK (same endpoint).
 * Only the “generic” provider has no reliable default (unknown namespace):
 * without (1) nor (2), we raise `AgentModelRequiredError` — the user must
 * choose a model (the picker lists those of its provider).
 *
 * ENDPOINT — only one active BYOK per account: provider + base URL + user key
 * if present (unlimited use, at own expense), otherwise the OpenRouter platform key
 * OPENROUTER_API_KEY (capped monthly, see quota.ts).
 */

/** Root default (admin): app_config.agent_model or the fallback code. */
export async function getRootDefaultModel(): Promise<string> {
  return (await getAppConfigValue(AGENT_MODEL_CONFIG_KEY))?.trim() || AGENT_ROOT_MODEL_FALLBACK;
}

/**
 * Border default of a BYOK provider — adjustable from /admin
 * (`byok_default_model_<provider>`), otherwise that of the providers register.
 *
 * This is the model used by an account which has installed its key without ever choosing one:
 * it changes with each generation of templates, so it can't live only
 * in the code. `undefined` remains possible — OpenRouter (which takes the default
 * root) and the generic (unknown namespace) do not have them.
 */
export async function resolveProviderDefaultModel(
  providerId: string | null | undefined,
): Promise<string | undefined> {
  const fallback = getProviderDefaultModel(providerId);
  if (!providerId || !fallback) return fallback;
  const configured = await getAppConfigValue(byokDefaultModelKey(providerId)).catch(() => null);
  return configured?.trim() || fallback;
}

/** User's personal default, or null if they have not defined one. */
export async function getUserDefaultModel(userId: string): Promise<string | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("user_agent_preferences")
    .select("default_model")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { default_model: string | null } | null)?.default_model ?? null;
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
 * Fix reasoning level to FREEZE on a run (MIN-122). Cascade
 * run > user > `DEFAULT_REASONING_LEVEL` (`medium`) — no root default: none
 * admin setting here.
 *
 * The four levels are open to ALL, minddy quota included: the subscription is
 * paid, it must be fully usable. What limits the expense is the budget
 * itself (`checkAgentQuota` at launch, and stopping mid-run when it
 * is exhausted), not a restriction on the level.
 */
export async function resolveReasoningLevel(opts: {
  perRunLevel?: string | null;
  userId: string;
}): Promise<ReasoningLevel> {
  const perRun = isReasoningLevel(opts.perRunLevel) ? opts.perRunLevel : null;
  return perRun ?? (await getUserDefaultReasoningLevel(opts.userId)) ?? DEFAULT_REASONING_LEVEL;
}

/** Raised when a non-OpenRouter BYOK provider has no resolved model. */
export class AgentModelRequiredError extends Error {
  code = "noModelForProvider" as const;
  constructor(public provider: string) {
    super(`No default model for provider ${provider}; a model must be selected`);
    this.name = "AgentModelRequiredError";
  }
}

/** Model frozen on a run, and who came from this choice. */
export interface ResolvedAgentModel {
  model: string;
  /**
 * True when the model comes from SOMEONE — run override (chosen at
 * launch, or forced by Numo) or personal account default. False when it comes
 * from a minddy fault (provider boundary, or root fault).
 *
 * This is the distinction that the plan cap applies (`ensureModelInPlan`):
 * minddy does not deny itself its own faults.
 */
  chosenByUser: boolean;
}

/**
 * Resolves which model to freeze on a run. `perRunModel` (override/forcing) wins,
 * otherwise the personal default, otherwise the border default of the BYOK provider, otherwise —
 * quota minddy or OpenRouter BYOK — the root default. Raise
 * `AgentModelRequiredError` only for generic BYOK without template.
 */
export async function resolveAgentModel(opts: {
  perRunModel?: string | null;
  userId: string;
  surface?: Extract<AiSurface, "agent" | "automations">;
}): Promise<ResolvedAgentModel> {
  const perRun = opts.perRunModel?.trim();
  if (perRun) return { model: perRun, chosenByUser: true };

  // A channel/routine is a distinct feature: its BYOK choice must not
  // be overwritten by the agent's interactive default. Without BYOK on this
  // surface, it continues naturally on the historic Minddy waterfall.
  if (opts.surface === "automations") {
    const automationByok = await getUserByok(opts.userId, "automations");
    if (automationByok) {
      const chosen = automationByok.featureModels.automation_agent_model?.trim();
      if (chosen) return { model: chosen, chosenByUser: true };
      if (automationByok.provider === "openrouter") {
        return {
          model:
            (await getAppConfigValue("automation_agent_model"))?.trim() ||
            aiModelFallback("automation_agent_model"),
          chosenByUser: false,
        };
      }
      const featureKey = byokFeatureDefaultModelKey(
        automationByok.provider,
        "automation_agent_model",
      );
      const configured = (await getAppConfigValue(featureKey).catch(() => null))?.trim();
      const fallback = aiModelFallback(featureKey).trim();
      const providerDefault =
        configured || fallback || (await resolveProviderDefaultModel(automationByok.provider));
      if (providerDefault) return { model: providerDefault, chosenByUser: false };
      throw new AgentModelRequiredError(automationByok.provider);
    }
    return {
      model:
        (await getAppConfigValue("automation_agent_model"))?.trim() ||
        aiModelFallback("automation_agent_model"),
      chosenByUser: false,
    };
  }
  const userDefault = await getUserDefaultModel(opts.userId);
  if (userDefault) return { model: userDefault, chosenByUser: true };
  const byok = await getUserByok(opts.userId, opts.surface ?? "agent");
  // Provider border fault (openai/anthropic/google), adjustable in /admin.
  const providerDefault = byok ? await resolveProviderDefaultModel(byok.provider) : undefined;
  if (providerDefault) return { model: providerDefault, chosenByUser: false };
  // Generic BYOK: no reliable default → user must choose.
  if (byok && byok.provider !== "openrouter") {
    throw new AgentModelRequiredError(byok.provider);
  }
  // Quota minddy (platform) or OpenRouter BYOK: root default app_config.
  return { model: await getRootDefaultModel(), chosenByUser: false };
}

// ── REREADING model (MIN-141, carried here by MIN-168) ────────────────────
// A review session is a run like any other, but its model is not
// does not resolve like a code run: `pr_review_model` is
// DELIBERATELY distinct from `agent_model` — have code reread by the model which
// just wrote it gives an identical second opinion, and that's the whole reason
// to be in the pass.

/** `app_config` key of the review template — the instance default, adjustable in /admin. */
export const PR_REVIEW_MODEL_CONFIG_KEY = "pr_review_model";

/**
 * The model which will reread, in three steps: what was chosen FOR THIS
 * SESSION, otherwise the last choice of the account, otherwise the default of the instance.
 *
 * The first two stages are explicit user choices and therefore remain subject
 * to the plan ceiling. The instance default is not: launch maps that fallback
 * to the active BYOK provider when needed, so a native endpoint never receives
 * an incompatible OpenRouter model identifier.
 */
export async function resolvePrReviewModel(opts: {
  perCall?: string | null;
  userId: string;
  /** True when we have just explicitly requested the default of the instance. */
  ignoreRemembered?: boolean;
}): Promise<ResolvedAgentModel> {
  const perCall = opts.perCall?.trim();
  if (perCall) return { model: perCall, chosenByUser: true };
  if (!opts.ignoreRemembered) {
    const remembered = await getUserPrReviewModel(opts.userId);
    if (remembered) return { model: remembered, chosenByUser: true };
  }
  const defaultModel = await getPrReviewDefaultModelForUser(opts.userId);
  if (!defaultModel) {
    const byok = await getUserByok(opts.userId, "agent");
    throw new AgentModelRequiredError(byok?.provider ?? DEFAULT_AGENT_PROVIDER);
  }
  return { model: defaultModel, chosenByUser: false };
}

/** The default of the instance alone (without the choice of account) — what the UI displays
 * as an aside on the “default model” option of the picker. */
export async function getInstancePrReviewModel(): Promise<string> {
  return (
    (await getAppConfigValue(PR_REVIEW_MODEL_CONFIG_KEY))?.trim() ||
    aiModelFallback(PR_REVIEW_MODEL_CONFIG_KEY)
  );
}

/**
 * Effective review default for an account.
 *
 * Platform runs use the instance's OpenRouter model. BYOK runs stay in the
 * active provider's namespace: an account-level feature choice wins, followed
 * by the provider-specific admin default and the provider registry fallback.
 */
export async function getPrReviewDefaultModelForUser(userId: string): Promise<string | null> {
  const byok = await getUserByok(userId, "agent");
  if (!byok) return getInstancePrReviewModel();

  const chosen = byok.featureModels.pr_review_model?.trim();
  if (chosen) return chosen;
  if (byok.provider === "openrouter") return getInstancePrReviewModel();

  const featureKey = byokFeatureDefaultModelKey(byok.provider, PR_REVIEW_MODEL_CONFIG_KEY);
  const configured = (await getAppConfigValue(featureKey).catch(() => null))?.trim();
  const fallback = aiModelFallback(featureKey).trim();
  const providerDefault =
    configured || fallback || (await resolveProviderDefaultModel(byok.provider));
  return providerDefault || null;
}

/** Last review template chosen by this account, or null. */
export async function getUserPrReviewModel(userId: string): Promise<string | null> {
  const { data } = await getServiceClient()
    .from("user_agent_preferences")
    .select("pr_review_model")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { pr_review_model: string | null } | null)?.pr_review_model ?? null;
}

/**
 * Retains the chosen model: the next time, “have Numo check” leaves
 * from there. `null` erases the choice — that's what "revert to the default of
 * minddy" in the picker means, and otherwise the selected choice would win forever.
 * Best-effort — an unremembered choice should not prevent review.
 */
export async function rememberPrReviewModel(
  userId: string,
  model: string | null,
): Promise<void> {
  try {
    await getServiceClient()
      .from("user_agent_preferences")
      .upsert({ user_id: userId, pr_review_model: model }, { onConflict: "user_id" });
  } catch (err) {
    console.error("[agent-model] remember review model failed:", (err as Error).message);
  }
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
  surface: Extract<AiSurface, "agent" | "automations"> = "agent",
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
