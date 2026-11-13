/**
 * The engine that answers AI decisions (MIN-980): Smart Fill, Smart Assign,
 * relations, background screening and the feedback review.
 *
 * - `model`: a decision model on OpenRouter's decisions endpoint (Jev by
 *   default), with the language model as fallback when it cannot answer
 *   confidently.
 * - `llm`: the language model answers directly. Decision models are rare
 *   outside OpenRouter, so this mode lets an instance or an account decide
 *   with any provider that serves a language model.
 *
 * The administrator sets the instance's engine (`decision_engine` in
 * `app_config`), which every account follows unless it chose its own.
 *
 * Pure module: shared by the admin dashboard, the account settings and the
 * server.
 */
import { isLocalAgentProvider, type AgentProviderId } from "@/lib/agent-providers";
import { providerSupportsModelCapability } from "@/lib/model-catalog-capability";

export const DECISION_ENGINES = ["model", "llm"] as const;

export type DecisionEngine = (typeof DECISION_ENGINES)[number];

/** `app_config` key of the instance's engine. */
export const DECISION_ENGINE_CONFIG_KEY = "decision_engine";

export const DEFAULT_DECISION_ENGINE: DecisionEngine = "model";

export function isDecisionEngine(value: unknown): value is DecisionEngine {
  return typeof value === "string" && (DECISION_ENGINES as readonly string[]).includes(value);
}

/** A stored value, or the default when it is unset or unknown. */
export function toDecisionEngine(value: string | null | undefined): DecisionEngine {
  const trimmed = value?.trim();
  return isDecisionEngine(trimmed) ? trimmed : DEFAULT_DECISION_ENGINE;
}

/**
 * Whether an account credential of this provider can answer decisions with
 * this engine. Only OpenRouter publishes the decisions endpoint; any provider
 * that serves a language model on the server can answer as an LLM. Local
 * endpoints are never reached from the server.
 */
export function providerServesDecisions(provider: AgentProviderId, engine: DecisionEngine): boolean {
  if (engine === "model") return provider === "openrouter";
  return !isLocalAgentProvider(provider) && providerSupportsModelCapability(provider, "text");
}
