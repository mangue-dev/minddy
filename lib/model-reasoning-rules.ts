import { getAgentProvider, type AgentProviderId } from "./agent-providers";
import type { ModelReasoning, ReasoningLevel } from "./agent-reasoning";

/**
 * Which reasoning levels each model really honors, provider by provider
 * (MIN-826). Shared by the request translator (`lib/ai-chat.ts`), the model
 * catalogs and the reasoning picker, so the picker never offers a level the
 * request would drop. Pure and client-safe: no server-only import.
 */

export function isAdaptiveClaude(model: string): boolean {
  return (
    /^claude-(?:opus|sonnet|fable|mythos|haiku)-5(?:-|$)/i.test(model) ||
    /^claude-(?:opus|sonnet)-4-(?:[6-9]|\d{2,})(?:-|$)/i.test(model) ||
    /^claude-mythos-preview(?:-|$)/i.test(model)
  );
}

/** Claude 4.6: adaptive, but predates `xhigh` and still accepts sampling fields. */
export function isClaude46(model: string): boolean {
  return /^claude-(?:opus|sonnet)-4-6(?:-|$)/i.test(model);
}

/** Families that take a manual `budget_tokens` (4.6 accepts it as a deprecated escape hatch). */
export function isManualThinkingClaude(model: string): boolean {
  return /^claude-(?:opus|sonnet|haiku)-4-(?:5|6)(?:-|$)/i.test(model);
}

/**
 * Families that reject `thinking: {type: "disabled"}` with a 400. At "off"
 * they run at the cheapest effort instead. Sonnet 5.5 also supports
 * `between_tools` at effort `high` or below; this adapter does not use it.
 */
export function isAlwaysThinkingClaude(model: string): boolean {
  return (
    /^claude-(?:fable|mythos)-5(?:-|$)/i.test(model) ||
    /^claude-(?:opus|sonnet)-5-5(?:-|$)/i.test(model) ||
    /^claude-mythos-preview(?:-|$)/i.test(model)
  );
}

/**
 * What the BYOK reasoning picker offers for an Anthropic model: Anthropic's
 * `/v1/models` publishes no effort list, so the levels follow the documented
 * per-family table. Adaptive families take `low` to `max` (no `xhigh` before
 * 4.7) and are `mandatory` when thinking cannot be disabled. Manual-budget
 * families (4.5) keep the generic levels, which map to a budget.
 * `undefined` = generic levels.
 */
export function anthropicModelReasoning(model: string): ModelReasoning | undefined {
  if (!isAdaptiveClaude(model)) return undefined;
  const efforts: ReasoningLevel[] = isClaude46(model)
    ? ["low", "medium", "high", "max"]
    : ["low", "medium", "high", "xhigh", "max"];
  return { efforts, mandatory: isAlwaysThinkingClaude(model) };
}

/**
 * OpenAI reasoning families. Only these accept `reasoning_effort`; sending it
 * to a chat model (gpt-4o, gpt-4.1) is a 400. GPT-5.1 and later accept
 * `"none"`, which really disables reasoning; GPT-5 and the o-series always
 * reason (GPT-5 also has `minimal`).
 */
function isOpenAiReasoningModel(model: string): boolean {
  return /^(?:o\d|gpt-5)(?:[-.]|$)/i.test(model);
}

export function openAiModelReasoning(model: string): ModelReasoning | null {
  if (!isOpenAiReasoningModel(model)) return null;
  if (/^gpt-5\.\d/i.test(model)) return { efforts: ["low", "medium", "high"], mandatory: false };
  if (/^gpt-5(?:-|$)/i.test(model)) {
    return { efforts: ["minimal", "low", "medium", "high"], mandatory: true };
  }
  return { efforts: ["low", "medium", "high"], mandatory: true };
}

/**
 * Gemini thinking families on the OpenAI-compatible endpoint
 * (ai.google.dev/gemini-api/docs/openai): 2.5 Flash and Flash-Lite can stop
 * thinking with `"none"`; 2.5 Pro and Gemini 3 cannot; Gemini 3 Pro only takes
 * `low` and `high`. Earlier families and Gemma do not think.
 */
export function geminiModelReasoning(model: string): ModelReasoning | null {
  if (/^gemini-2\.5-flash/i.test(model)) return { efforts: ["low", "medium", "high"], mandatory: false };
  if (/^gemini-2\.5-pro/i.test(model)) return { efforts: ["low", "medium", "high"], mandatory: true };
  if (/^gemini-3(?:\.\d+)?-pro/i.test(model)) return { efforts: ["low", "high"], mandatory: true };
  if (/^gemini-3(?:[-.]|$)/i.test(model)) return { efforts: ["low", "medium", "high"], mandatory: true };
  return null;
}

/**
 * The reasoning levels a direct (non-OpenRouter) provider really honors for a
 * model, for its picker and its translation alike. `null` = no reasoning
 * control reaches the model: it does not reason, or the endpoint has no
 * reasoning field (OpenCode gateways, generic and local servers).
 * `undefined` = no rule, the generic levels apply (OpenRouter publishes its
 * own per model; manual-budget Claude models map every level to a budget).
 */
export function nativeModelReasoning(
  provider: AgentProviderId,
  model: string,
): ModelReasoning | null | undefined {
  if (provider === "openrouter") return undefined;
  if (provider === "anthropic") return anthropicModelReasoning(model);
  if (provider === "openai") return openAiModelReasoning(model);
  if (provider === "google") return geminiModelReasoning(model);
  return getAgentProvider(provider)?.requestProfile.reasoningField ? undefined : null;
}

/**
 * A model's reasoning for the picker and the server alike: its catalog entry
 * when it has one, otherwise the provider rule — local and generic endpoints
 * have no listable catalog, and their models must not show inert levels.
 */
export function catalogModelReasoning(
  provider: AgentProviderId,
  modelId: string | null | undefined,
  entry?: { reasoning?: ModelReasoning | null },
): ModelReasoning | null | undefined {
  if (entry && entry.reasoning !== undefined) return entry.reasoning;
  return modelId ? nativeModelReasoning(provider, modelId) : undefined;
}
