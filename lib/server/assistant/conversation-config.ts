import "server-only";

import {
  DEFAULT_REASONING_LEVEL,
  isReasoningLevel,
  nearestReasoningLevel,
  reasoningLevelsFor,
  type ReasoningLevel,
} from "@/lib/agent-reasoning";
import { getAssistantModelsForUser, getOpenRouterConversationModels, type AgentModelEntry } from "@/lib/server/agent/models-catalog";
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

import { getNumoDefaultModel, getNumoProvider, numoModelIsInstanceDefined } from "./model-preferences";

const MAX_MODEL_LENGTH = 300;

export type NumoConversationConfigErrorCode =
  | "invalid_model"
  | "invalid_reasoning"
  | "model_unavailable"
  | "model_catalog_unavailable"
  | "provider_unavailable"
  | "invalid_provider"
  | "reasoning_unsupported"
  | "model_locked";

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
  /**
   * True when the instance sets Numo's model and reasoning (MIN-954): a model
   * or level stored on the conversation is ignored, and a new one is refused.
   */
  modelLocked: boolean;
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
 * On a personal key, explicit choices are never replaced with a default: they
 * either pass the provider catalog or return a validation error. On the
 * instance's provider, the instance's model and reasoning level always run.
 */
export async function resolveNumoTurnConfiguration(input: {
  userId: string;
  /** The conversation's provider (MIN-826); null follows the Numo usage route. */
  provider?: unknown;
  model?: unknown;
  reasoningLevel?: unknown;
  managedOnly?: boolean;
  /** Validation only: the returned runtime must not pay for a call (MIN-761). */
  catalogOnly?: boolean;
}): Promise<ResolvedNumoTurnConfiguration> {
  const persistedProvider = input.managedOnly ? null : normalizeProvider(input.provider);
  const requestedModel = normalizeModel(input.model);
  const requestedReasoning = normalizeReasoning(input.reasoningLevel);
  // On the instance's provider, the administrator's model and reasoning
  // apply (MIN-954). A choice stored before is ignored rather than migrated,
  // so the previous release still reads the same rows.
  const effectiveProvider = input.managedOnly
    ? MINDDY_CLOUD_PROVIDER
    : persistedProvider ?? await getNumoProvider(input.userId);
  let modelLocked = numoModelIsInstanceDefined(effectiveProvider);
  let persistedModel = modelLocked ? null : requestedModel;
  let persistedReasoningLevel = modelLocked ? null : requestedReasoning;

  // Without a model, the provider's saved default applies.
  let defaultModel = !modelLocked && persistedModel === null
    ? await getNumoDefaultModel(input.userId, effectiveProvider)
    : null;
  const resolveRuntime = (modelOverride: string | null) => resolveAiRuntime({
    userId: input.userId,
    modelKey: "assistant_model",
    surface: "assistant",
    provider: persistedProvider,
    modelOverride,
    applicationModelDefault: true,
    ...(input.managedOnly ? { managedOnly: true } : {}),
    ...(input.catalogOnly ? { catalogOnly: true } : {}),
  });
  let runtime: ResolvedAiRuntime;
  try {
    runtime = await resolveRuntime(persistedModel ?? defaultModel);
    // A personal route whose key no longer serves falls back to the
    // instance: its model then comes from the instance too.
    if (!modelLocked && runtime.mode === "platform") {
      modelLocked = true;
      persistedModel = null;
      persistedReasoningLevel = null;
      if (requestedModel !== null || defaultModel !== null) runtime = await resolveRuntime(null);
      defaultModel = null;
    }
  } catch (error) {
    if (error instanceof ChosenProviderUnavailableError) {
      throw new NumoConversationConfigError("provider_unavailable", error.message);
    }
    throw error;
  }
  const hasExplicitModel = persistedModel !== null || defaultModel !== null;
  const hasExplicitReasoning = persistedReasoningLevel !== null;

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
  }

  const modelReasoning = catalogModelReasoning(runtime.provider, runtime.model, modelEntry);
  const allowedReasoning = conversationReasoningLevels(reasoningLevelsFor(modelReasoning));
  if (persistedReasoningLevel !== null && !allowedReasoning.includes(persistedReasoningLevel)) {
    throw new NumoConversationConfigError(
      "reasoning_unsupported",
      `The reasoning level “${persistedReasoningLevel}” is not supported by “${runtime.model}”. Choose another level.`,
    );
  }

  const chosenReasoning = persistedReasoningLevel !== null
    ? persistedReasoningLevel
    : nearestReasoningLevel(configuredReasoning ?? DEFAULT_REASONING_LEVEL, allowedReasoning);
  return {
    persistedProvider,
    modelLocked,
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

/**
 * Refuses a model or reasoning level sent for a conversation whose model the
 * instance sets (MIN-954). Clearing them (`null`) stays allowed.
 */
export function assertNumoChoiceAllowed(
  configuration: Pick<ResolvedNumoTurnConfiguration, "modelLocked">,
  choice: { model?: unknown; reasoningLevel?: unknown },
): void {
  const sent = (value: unknown) => value !== undefined && value !== null && value !== "";
  if (configuration.modelLocked && (sent(choice.model) || sent(choice.reasoningLevel))) {
    throw new NumoConversationConfigError(
      "model_locked",
      "Numo's model is set by this workspace's administrator. Use a personal key to choose another.",
    );
  }
}

export function isNumoConversationConfigError(
  error: unknown,
): error is NumoConversationConfigError {
  return error instanceof NumoConversationConfigError;
}
