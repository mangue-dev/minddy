import "server-only";

import {
  DEFAULT_REASONING_LEVEL,
  isReasoningLevel,
  nearestReasoningLevel,
  reasoningLevelsFor,
  type ReasoningLevel,
} from "@/lib/agent-reasoning";
import { getAssistantModelsForUser, type AgentModelEntry } from "@/lib/server/agent/models-catalog";
import { ensureModelInPlan } from "@/lib/server/agent/model-plan";
import {
  resolveAiRuntime,
  type ResolvedAiRuntime,
} from "@/lib/server/ai-runtime";
import { isLocalAgentProvider } from "@/lib/agent-providers";
import { getAssistantReasoningLevel } from "@/lib/server/assistant/reasoning";

const MAX_MODEL_LENGTH = 300;

export type NumoConversationConfigErrorCode =
  | "invalid_model"
  | "invalid_reasoning"
  | "model_unavailable"
  | "model_catalog_unavailable"
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
  model?: unknown;
  reasoningLevel?: unknown;
}): Promise<ResolvedNumoTurnConfiguration> {
  const persistedModel = normalizeModel(input.model);
  const persistedReasoningLevel = normalizeReasoning(input.reasoningLevel);
  const hasExplicitModel = persistedModel !== null;
  const hasExplicitReasoning = persistedReasoningLevel !== null;

  const runtime = await resolveAiRuntime({
    userId: input.userId,
    modelKey: "assistant_model",
    surface: "assistant",
    modelOverride: persistedModel,
  });

  let modelEntry: AgentModelEntry | undefined;
  if (hasExplicitModel || hasExplicitReasoning) {
    const catalog = await getAssistantModelsForUser(input.userId);
    modelEntry = findModel(catalog.models, runtime.model);

    // A generic endpoint owns its model namespace and may not expose a model
    // list. Every catalog-backed provider must prove that the selected id is
    // currently available instead of silently falling back to another model.
    const catalogUnavailable = catalog.models.length === 0 &&
      runtime.provider !== "generic" && !isLocalAgentProvider(runtime.provider);
    if (hasExplicitModel && catalogUnavailable) {
      throw new NumoConversationConfigError(
        "model_catalog_unavailable",
        "The model catalog is unavailable. Try again before choosing a model.",
        503,
      );
    }
    if (hasExplicitModel && catalog.models.length > 0 && !modelEntry) {
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
      });
    }
  }

  const allowedReasoning = reasoningLevelsFor(modelEntry?.reasoning);
  const configuredReasoning = await getAssistantReasoningLevel();
  if (hasExplicitReasoning && !allowedReasoning.includes(persistedReasoningLevel)) {
    throw new NumoConversationConfigError(
      "reasoning_unsupported",
      `The reasoning level “${persistedReasoningLevel}” is not supported by “${runtime.model}”. Choose another level.`,
    );
  }

  return {
    model: runtime.model,
    reasoningLevel: hasExplicitReasoning
      ? persistedReasoningLevel
      : nearestReasoningLevel(configuredReasoning ?? DEFAULT_REASONING_LEVEL, allowedReasoning),
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
