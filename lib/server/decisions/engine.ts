import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValues } from "@/lib/server/app-config";
import { DatabaseOperationError } from "@/lib/server/failure-diagnostics";
import { getAgentProvider, isKnownAgentProvider, type AgentProviderId } from "@/lib/agent-providers";
import { DECISION_MODEL_CONFIG_KEY } from "@/lib/ai-model-config";
import type { AiProviderOption } from "@/lib/ai-provider-options";
import { isManagedAiEnabled } from "@/lib/managed-services";
import { resolveByokFeatureDefaultModel } from "@/lib/server/ai-runtime";
import { resolveConfiguredModel } from "@/lib/server/model-config";
import { getAiRoutes } from "@/lib/server/ai-routes";
import { MINDDY_CLOUD_PROVIDER, type AiProviderChoice } from "@/lib/ai-surfaces";
import {
  DECISION_ENGINE_CONFIG_KEY,
  isDecisionEngine,
  providerServesDecisions,
  toDecisionEngine,
  type DecisionEngine,
} from "@/lib/decision-engine";
import type { AiUsageBillTo } from "@/lib/server/ai-usage";

/**
 * Who answers an account's decisions (MIN-980): the engine (a decision model
 * or the language model), the provider, and the model.
 *
 * The instance's engine (`decision_engine`) applies to every account that did
 * not choose its own. Until the account names a provider, decisions run on
 * the language model's provider when it can serve the engine — so an account
 * whose language model runs on its OpenRouter key keeps paying decision-model
 * calls with it, as before MIN-980 — then on minddy Cloud, then on the first
 * key that can. A named credential that cannot serve the engine, or that was
 * removed, falls back to that default.
 */

export interface DecisionPreferences {
  /** The account's engine, or null to follow the instance. */
  engine: DecisionEngine | null;
  /** `minddy`, a credential's provider, or null for the default. */
  provider: AiProviderChoice | null;
  model: string | null;
  /** The engine `model` was chosen for. */
  modelEngine: DecisionEngine | null;
}

export interface DecisionRoute {
  engine: DecisionEngine;
  /** Who answers; null when no provider of the account can. */
  provider: AiProviderChoice | null;
  /** The model the chosen credential runs, or null for its default. */
  model: string | null;
}

const EMPTY_PREFERENCES: DecisionPreferences = {
  engine: null,
  provider: null,
  model: null,
  modelEngine: null,
};

/** The instance's engine; the default when the row is unset or unreadable. */
export async function getInstanceDecisionEngine(): Promise<DecisionEngine> {
  const values = await getAppConfigValues([DECISION_ENGINE_CONFIG_KEY]).catch(
    () => ({}) as Record<string, string | null>,
  );
  return toDecisionEngine(values[DECISION_ENGINE_CONFIG_KEY]);
}

function toProviderChoice(value: string | null | undefined): AiProviderChoice | null {
  if (value === MINDDY_CLOUD_PROVIDER) return MINDDY_CLOUD_PROVIDER;
  return value && isKnownAgentProvider(value) ? value : null;
}

export async function readDecisionPreferences(userId: string): Promise<DecisionPreferences> {
  const { data, error, status } = await getServiceClient()
    .from("user_ai_decision_preferences")
    .select("engine, provider, model, model_engine")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new DatabaseOperationError("read_decision_preferences", error, status);
  const row = data as {
    engine: string | null;
    provider: string | null;
    model: string | null;
    model_engine: string | null;
  } | null;
  if (!row) return EMPTY_PREFERENCES;
  return {
    engine: isDecisionEngine(row.engine) ? row.engine : null,
    provider: toProviderChoice(row.provider),
    model: row.model?.trim() || null,
    modelEngine: isDecisionEngine(row.model_engine) ? row.model_engine : null,
  };
}

export async function saveDecisionPreferences(
  userId: string,
  preferences: DecisionPreferences,
): Promise<void> {
  const model = preferences.model && preferences.modelEngine ? preferences.model : null;
  const { error, status } = await getServiceClient()
    .from("user_ai_decision_preferences")
    .upsert(
      {
        user_id: userId,
        engine: preferences.engine,
        provider: preferences.provider,
        model,
        model_engine: model ? preferences.modelEngine : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) throw new DatabaseOperationError("save_decision_preferences", error, status);
}

/** The providers of the account's validated server-side credentials. */
export async function readValidatedProviders(userId: string): Promise<AgentProviderId[]> {
  const { data, error, status } = await getServiceClient()
    .from("user_ai_keys")
    .select("provider, validated_at")
    .eq("user_id", userId);
  if (error) throw new DatabaseOperationError("read_ai_keys", error, status);
  return ((data ?? []) as Array<{ provider: string; validated_at: string | null }>)
    .filter((row) => !!row.validated_at && isKnownAgentProvider(row.provider))
    .map((row) => row.provider as AgentProviderId);
}

/** What an account's decisions can run on, besides its own preferences. */
export interface DecisionContext {
  instanceEngine: DecisionEngine;
  /** Providers of the account's validated credentials. */
  providers: readonly AgentProviderId[];
  /** The language model's provider. */
  llmProvider: AiProviderChoice;
  /** Whether minddy Cloud is available on the instance. */
  managed: boolean;
}

function canServe(provider: AiProviderChoice, engine: DecisionEngine, context: DecisionContext): boolean {
  if (provider === MINDDY_CLOUD_PROVIDER) return context.managed;
  return context.providers.includes(provider) && providerServesDecisions(provider, engine);
}

/** The provider of an account that named none (see the module comment). */
export function defaultDecisionProvider(
  engine: DecisionEngine,
  context: DecisionContext,
): AiProviderChoice | null {
  if (canServe(context.llmProvider, engine, context)) return context.llmProvider;
  if (context.managed) return MINDDY_CLOUD_PROVIDER;
  return context.providers.find((provider) => providerServesDecisions(provider, engine)) ?? null;
}

/**
 * The route of one account's decisions, from its preferences and what it can
 * run on. Pure, so the rules are testable.
 */
export function decisionRouteFrom(
  context: DecisionContext,
  preferences: DecisionPreferences,
): DecisionRoute {
  const engine = preferences.engine ?? context.instanceEngine;
  const chosen = preferences.provider && canServe(preferences.provider, engine, context)
    ? preferences.provider
    : null;
  const provider = chosen ?? defaultDecisionProvider(engine, context);
  // The instance sets the model on minddy Cloud; only a personal key the
  // account chose takes one, under the engine it was chosen for.
  const model = chosen && chosen !== MINDDY_CLOUD_PROVIDER && preferences.modelEngine === engine
    ? preferences.model
    : null;
  return { engine, provider, model };
}

async function readDecisionContext(userId: string, tolerant: boolean): Promise<DecisionContext> {
  const [instanceEngine, providers, routes] = await Promise.all([
    getInstanceDecisionEngine(),
    tolerant
      ? readValidatedProviders(userId).catch(() => [] as AgentProviderId[])
      : readValidatedProviders(userId),
    getAiRoutes(userId).catch(() => null),
  ]);
  return {
    instanceEngine,
    providers,
    llmProvider: routes?.assistant_model ?? MINDDY_CLOUD_PROVIDER,
    managed: isManagedAiEnabled(),
  };
}

/** The account a decision bills, if any. */
export async function billedUserIdOf(billTo: AiUsageBillTo): Promise<string | null> {
  if ("userId" in billTo) return billTo.userId || null;
  if (!("projectOwner" in billTo)) return null;
  const { data } = await getServiceClient()
    .from("projects")
    .select("owner_id")
    .eq("id", billTo.projectOwner)
    .maybeSingle();
  return (data as { owner_id?: string } | null)?.owner_id ?? null;
}

/**
 * The route of the decisions an account pays for. A call that bills no
 * account follows the instance with the platform key. Never throws: an
 * unreadable preference reads as the default, so a decision never fails on it.
 */
export async function resolveDecisionRoute(userId: string | null): Promise<DecisionRoute> {
  if (!userId) return { engine: await getInstanceDecisionEngine(), provider: null, model: null };
  const [preferences, context] = await Promise.all([
    readDecisionPreferences(userId).catch(() => EMPTY_PREFERENCES),
    readDecisionContext(userId, true),
  ]);
  return decisionRouteFrom(context, preferences);
}

// ── Account settings (MIN-980) ───────────────────────────────────────────────

/** What the account's AI settings show for decisions. */
export interface DecisionSettings {
  /** The administrator's engine, which the account follows by default. */
  instance_engine: DecisionEngine;
  /** The account's own engine, or null to follow the instance. */
  engine: DecisionEngine | null;
  /** Who answers the account's decisions; null when no provider can. */
  provider: AiProviderChoice | null;
  /** The account's model for that provider, under the current engine. */
  model: string | null;
  /** The model the provider runs when the account chose none. */
  default_model: string | null;
  /** Providers the account can choose under the current engine. */
  providers: AiProviderOption[];
}

export class DecisionSettingsError extends Error {
  constructor(message: string, readonly code: string, readonly status = 422) {
    super(message);
    this.name = "DecisionSettingsError";
  }
}

const MODEL_ID_RE = /^[A-Za-z0-9_./:@-]{1,200}$/;

function providerOptions(context: DecisionContext, engine: DecisionEngine): AiProviderOption[] {
  return [
    ...(context.managed ? [{ id: MINDDY_CLOUD_PROVIDER, label: "minddy Cloud" } as AiProviderOption] : []),
    ...context.providers.filter((provider) => providerServesDecisions(provider, engine)).map((provider) => ({
      id: provider,
      label: getAgentProvider(provider)?.label ?? provider,
    })),
  ];
}

/** The model a credential runs for decisions when the account chose none. */
async function defaultDecisionModel(
  userId: string,
  provider: AgentProviderId,
  engine: DecisionEngine,
): Promise<string | null> {
  if (engine === "model") return (await resolveConfiguredModel(DECISION_MODEL_CONFIG_KEY)).model;
  // The language model the account runs on this provider (MIN-954).
  const { getNumoDefaultModel } = await import("@/lib/server/assistant/model-preferences");
  const chosen = (await getNumoDefaultModel(userId, provider).catch(() => null))?.trim();
  return chosen || resolveByokFeatureDefaultModel(provider, "assistant_model");
}

export async function getDecisionSettings(userId: string): Promise<DecisionSettings> {
  const [preferences, context] = await Promise.all([
    readDecisionPreferences(userId),
    readDecisionContext(userId, false),
  ]);
  const route = decisionRouteFrom(context, preferences);
  const ownKey = route.provider && route.provider !== MINDDY_CLOUD_PROVIDER ? route.provider : null;
  return {
    instance_engine: context.instanceEngine,
    engine: preferences.engine,
    provider: route.provider,
    model: route.model,
    default_model: ownKey ? await defaultDecisionModel(userId, ownKey, route.engine).catch(() => null) : null,
    providers: providerOptions(context, route.engine),
  };
}

export interface DecisionSettingsPatch {
  engine?: DecisionEngine | null;
  provider?: AiProviderChoice | null;
  model?: string | null;
}

/**
 * Applies a change of the account's decision settings. A new engine or a new
 * provider clears the model: decision model ids and language model ids do not
 * share a namespace. A new engine also returns to the default a provider that
 * cannot serve it. A model is only taken with a personal key; a decision
 * model must be one of that key's decision models.
 */
export async function updateDecisionSettings(
  userId: string,
  patch: DecisionSettingsPatch,
): Promise<DecisionSettings> {
  const [current, context] = await Promise.all([
    readDecisionPreferences(userId),
    readDecisionContext(userId, false),
  ]);
  const next: DecisionPreferences = { ...current };
  const before = decisionRouteFrom(context, current);
  if (patch.engine !== undefined) next.engine = patch.engine;
  const engine = next.engine ?? context.instanceEngine;

  if (patch.provider !== undefined) {
    const provider = patch.provider;
    if (provider && !canServe(provider, engine, context)) {
      throw new DecisionSettingsError("This provider cannot answer decisions.", "provider_unavailable");
    }
    next.provider = provider;
  } else if (next.provider && !canServe(next.provider, engine, context)) {
    next.provider = null;
  }
  const after = decisionRouteFrom(context, { ...next, model: null, modelEngine: null });
  if (after.provider !== before.provider || engine !== before.engine) {
    next.model = null;
    next.modelEngine = null;
  }

  if (patch.model !== undefined) {
    const model = patch.model?.trim() || null;
    if (model) {
      // A model applies to the provider shown, chosen or not.
      const provider = after.provider;
      if (!provider || provider === MINDDY_CLOUD_PROVIDER) {
        throw new DecisionSettingsError(
          "This workspace's administrator sets the decision model. Use a personal key to choose another.",
          "model_locked",
        );
      }
      if (!MODEL_ID_RE.test(model)) {
        throw new DecisionSettingsError("Invalid model id.", "invalid_model", 400);
      }
      if (engine === "model") {
        const { getActiveByokModelCatalog } = await import("@/lib/server/agent/models-catalog");
        const catalog = await getActiveByokModelCatalog(userId, "decision", provider);
        if (catalog.models.length === 0) {
          throw new DecisionSettingsError("The decision model catalog is unavailable.", "catalog_unavailable", 503);
        }
        if (!catalog.models.some((entry) => entry.id === model)) {
          throw new DecisionSettingsError("This model is not a decision model.", "not_a_decision_model", 400);
        }
      }
      next.provider = provider;
    }
    next.model = model;
    next.modelEngine = model ? engine : null;
  }

  await saveDecisionPreferences(userId, next);
  return getDecisionSettings(userId);
}
