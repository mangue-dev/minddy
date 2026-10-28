import "server-only";

import {
  DEFAULT_REASONING_LEVEL,
  isReasoningLevel,
  nearestReasoningLevel,
  reasoningLevelsFor,
  type ReasoningLevel,
} from "@/lib/agent-reasoning";
import { getAssistantModelsForUser, getOpenRouterConversationModels, type AgentModelEntry } from "@/lib/server/agent/models-catalog";
import type { ResolvedBilling } from "@/lib/server/billing-accounts";
import { ensureModelInPlan } from "@/lib/server/agent/model-plan";
import { ChosenProviderUnavailableError } from "@/lib/server/ai-provider-errors";
import {
  resolveAiRuntime,
  type ResolvedAiRuntime,
} from "@/lib/server/ai-runtime";
import { isKnownAgentProvider, isLocalAgentProvider } from "@/lib/agent-providers";
import { MINDDY_CLOUD_PROVIDER, type AiProviderChoice } from "@/lib/ai-surfaces";
import { catalogModelReasoning } from "@/lib/model-reasoning-rules";
import { getAssistantReasoningLevel } from "@/lib/server/assistant/reasoning";
import { conversationReasoningLevels } from "@/lib/conversation-settings";

import { getNumoDefaultModel, getNumoPreferences } from "./model-preferences";

const MAX_MODEL_LENGTH = 300;

export type NumoConversationConfigErrorCode =
  | "invalid_model"
  | "invalid_reasoning"
  | "model_unavailable"
  | "model_catalog_unavailable"
  | "provider_unavailable"
  | "invalid_provider"
  | "reasoning_unsupported";

/** A user-facing validation failure for a conversation choice. */
export class NumoConversationConfigError extends Error {
  constructor(
    public readonly code: NumoConversationConfigErrorCode,
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = "NumoConversationConfigError";
  }
}

export interface ResolvedNumoTurnConfiguration {
  /** The exact model passed to the admitted turn. */
  model: string;
  /** The exact reasoning level passed to the admitted turn. */
  reasoningLevel: ReasoningLevel;
  /** The provider and credential selected for this request. */
  runtime: ResolvedAiRuntime;
  /** Values persisted on the conversation; null means follow the default. */
  persistedProvider: AiProviderChoice | null;
  persistedModel: string | null;
  persistedReasoningLevel: ReasoningLevel | null;
}

function normalizeModel(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > MAX_MODEL_LENGTH) {
    throw new NumoConversationConfigError(
      "invalid_model",
      "The selected model is invalid. Choose a model from the list.",
    );
  }
  const model = value.trim();
  if (!model) return null;
  return model;
}

function normalizeProvider(value: unknown): AiProviderChoice | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === MINDDY_CLOUD_PROVIDER || (typeof value === "string" && isKnownAgentProvider(value))) {
    return value as AiProviderChoice;
  }
  throw new NumoConversationConfigError(
    "invalid_provider",
    "The selected provider is invalid. Choose a provider from the list.",
  );
}

function normalizeReasoning(value: unknown): ReasoningLevel | null {
  if (value === undefined || value === null || value === "") return null;
  if (!isReasoningLevel(value)) {
    throw new NumoConversationConfigError(
      "invalid_reasoning",
      "The selected reasoning level is invalid. Choose a level from the list.",
    );
  }
  return value;
}

function findModel(models: AgentModelEntry[], model: string): AgentModelEntry | undefined {
  return models.find((entry) => entry.id === model);
}

/**
 * Resolve and validate one Numo configuration before `begin_numo_turn`.
 * Explicit choices are never replaced with a default: they either pass the
 * active provider catalog and plan ceiling or return a validation error.
 */
export async function resolveNumoTurnConfiguration(input: {
  userId: string;
  /** The conversation's provider (MIN-826); null follows the Numo usage route. */
  provider?: unknown;
  model?: unknown;
  reasoningLevel?: unknown;
  admittedBilling?: ResolvedBilling;
  managedOnly?: boolean;
  /** Validation only: the returned runtime must not pay for a call (MIN-761). */
  catalogOnly?: boolean;
}): Promise<ResolvedNumoTurnConfiguration> {
  const persistedProvider = input.managedOnly ? null : normalizeProvider(input.provider);
  const persistedModel = normalizeModel(input.model);
  const persistedReasoningLevel = normalizeReasoning(input.reasoningLevel);
  let hasExplicitModel = persistedModel !== null;
  const hasExplicitReasoning = persistedReasoningLevel !== null;

  // Without a model, the provider's saved default applies: the account's
  // Numo default for its own provider, or the default saved for the
  // conversation's provider.
  let defaultModel: string | null = null;
  if (!hasExplicitModel && !input.managedOnly) {
    defaultModel = persistedProvider
      ? await getNumoDefaultModel(input.userId, persistedProvider)
      : (await getNumoPreferences(input.userId)).default_model;
  }
  hasExplicitModel ||= defaultModel != null;
  let runtime: ResolvedAiRuntime;
  try {
    runtime = await resolveAiRuntime({
      userId: input.userId,
      modelKey: "assistant_model",
      surface: "assistant",
      provider: persistedProvider,
      modelOverride: persistedModel ?? defaultModel,
      applicationModelDefault: true,
      ...(input.managedOnly ? { managedOnly: true } : {}),
      ...(input.catalogOnly ? { catalogOnly: true } : {}),
    });
  } catch (error) {
    if (error instanceof ChosenProviderUnavailableError) {
      throw new NumoConversationConfigError("provider_unavailable", error.message);
    }
    throw error;
  }

  // Inherited settings must use the same model capabilities as the picker.
  // Otherwise a generic default such as medium can be sent while the UI
  // correctly displays the nearest supported GLM level, low.
  const [models, configuredReasoning] = await Promise.all([
    runtime.provider === "openrouter"
      ? getOpenRouterConversationModels(runtime.apiKey)
      : getAssistantModelsForUser(input.userId, undefined, persistedProvider).then(catalog => catalog.models),
    getAssistantReasoningLevel(),
  ]);
  const modelEntry = findModel(models, runtime.model);
  if (hasExplicitModel || hasExplicitReasoning) {
    // A generic endpoint owns its model namespace and may not expose a model
    // list. Every catalog-backed provider must prove that the selected id is
    // currently available instead of silently falling back to another model.
    const catalogUnavailable = models.length === 0 &&
      runtime.provider !== "generic" && !isLocalAgentProvider(runtime.provider);
    if (hasExplicitModel && catalogUnavailable) {
      throw new NumoConversationConfigError(
        "model_catalog_unavailable",
        "The model catalog is unavailable. Try again before choosing a model.",
        503,
      );
    }
    if (hasExplicitModel && models.length > 0 && !modelEntry) {
      throw new NumoConversationConfigError(
        "model_unavailable",
        `The model “${runtime.model}” is unavailable for the active provider. Choose another model.`,
      );
    }
    if (hasExplicitModel && runtime.mode === "platform") {
      await ensureModelInPlan({
        userId: input.userId,
        model: runtime.model,
        mode: runtime.mode,
        ...(input.admittedBilling ? { admittedBilling: input.admittedBilling } : {}),
      });
    }
  }

  const modelReasoning = catalogModelReasoning(runtime.provider, runtime.model, modelEntry);
  const allowedReasoning = conversationReasoningLevels(reasoningLevelsFor(modelReasoning));
  if (hasExplicitReasoning && !allowedReasoning.includes(persistedReasoningLevel)) {
    throw new NumoConversationConfigError(
      "reasoning_unsupported",
      `The reasoning level “${persistedReasoningLevel}” is not supported by “${runtime.model}”. Choose another level.`,
    );
  }

  const chosenReasoning = hasExplicitReasoning
    ? persistedReasoningLevel
    : nearestReasoningLevel(configuredReasoning ?? DEFAULT_REASONING_LEVEL, allowedReasoning);
  return {
    persistedProvider,
    model: runtime.model,
    // The slider always starts at "Off", but a model that must reason cannot
    // honor it: its lowest level is what really runs (MIN-826).
    reasoningLevel: chosenReasoning === "off" && modelReasoning?.mandatory
      ? reasoningLevelsFor(modelReasoning)[0] ?? "off"
      : chosenReasoning,
    runtime,
    persistedModel,
    persistedReasoningLevel,
  };
}

export function isNumoConversationConfigError(
  error: unknown,
): error is NumoConversationConfigError {
  return error instanceof NumoConversationConfigError;
}
